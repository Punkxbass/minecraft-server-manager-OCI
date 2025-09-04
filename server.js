const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { Client } = require('ssh2');
const fetch = (...args) => globalThis.fetch(...args);
const allowedCommands = require('./secureCommands');

const app = express();
const port = 3000;
const execAsync = promisify(exec);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

const rootDir = '/home/ubuntu';

function resolveSafePath(requestedPath = '') {
  const safePath = path.posix
    .normalize('/' + requestedPath)
    .replace(/^\/+/, '');
  const fullPath = path.join(rootDir, safePath);
  if (!fullPath.startsWith(rootDir)) {
    throw new Error('Ruta no permitida.');
  }
  return fullPath;
}

// =============================
// Utilidades
// =============================
const sshConnections = new Map();
const SERVER_PATH_BASE = (user) => `/home/${user}/minecraft-server`;
const escapeForScreen = (cmd) => cmd.replace(/["\$]/g, '\\$&');

function execSshCommand(conn, command, streamRes = null) {
  return new Promise((resolve, reject) => {
    let output = '', errorOutput = '';
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      stream.on('close', (code) => {
        if (streamRes && !streamRes.writableEnded) streamRes.end();
        resolve({ code, output, error: errorOutput });
      }).on('data', (data) => {
        output += data.toString();
        if (streamRes && !streamRes.writableEnded) streamRes.write(data);
      }).stderr.on('data', (data) => {
        errorOutput += data.toString();
        if (streamRes && !streamRes.writableEnded) streamRes.write(data);
      });
    });
  });
}

async function executeSecureCommand(conn, commandKey, userArgs = []) {
  const commandConfig = allowedCommands[commandKey];
  if (!commandConfig) {
    throw new Error(`Comando no permitido: ${commandKey}`);
  }

  const sanitizedArgs = (userArgs || []).map(arg => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(String(arg))) {
      throw new Error('Argumento inválido detectado.');
    }
    return String(arg);
  });

  const finalArgs = [...commandConfig.args, ...sanitizedArgs];
  const commandString = `${commandConfig.cmd} ${finalArgs.join(' ')}`.trim();

  const { code, output, error } = await execSshCommand(conn, commandString);
  if (code !== 0) {
    throw new Error(error || 'Error ejecutando comando remoto');
  }
  return output;
}

// =============================
// Guías y Versiones
// =============================
app.get('/api/get-guide', async (req, res) => {
  const { file } = req.query;
  if (!file || !['guia_vps_oci.md', 'guia_oci_cli.md', 'guia_minecraft_manual.md', 'guia_mods.md'].includes(file)) {
    return res.status(400).json({ message: 'Archivo de guía no válido.' });
  }
  try {
    const filePath = path.join(__dirname, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const { marked } = await import('marked');
    const htmlContent = marked.parse(content);
    res.json({ success: true, content: htmlContent });
  } catch (err) {
    res.status(404).json({ message: `El archivo de la guía '${file}' no se encontró.` });
  }
});

app.get('/api/minecraft-versions', async (req, res) => {
  const { type } = req.query;
  try {
    let versions = [];
    if (type === 'vanilla' || type === 'fabric') {
      const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      if (!response.ok) throw new Error(`Error API Mojang: ${response.statusText}`);
      const data = await response.json();
      versions = data.versions.filter(v => v.type === 'release').map(v => v.id);
    } else if (type === 'paper') {
      const response = await fetch('https://api.papermc.io/v2/projects/paper');
      if (!response.ok) throw new Error(`Error API PaperMC: ${response.statusText}`);
      const data = await response.json();
      versions = data.versions.reverse();
    }
    res.json({ success: true, versions });
  } catch (error) {
    res.status(500).json({ message: `No se pudieron obtener las versiones: ${error.message}` });
  }
});

// =============================
// Conexión SSH
// =============================
app.post('/api/connect', (req, res) => {
  const { vpsIp, sshUser, sshKey } = req.body;
  if (!vpsIp || !sshUser || !sshKey) return res.status(400).json({ message: 'Faltan parámetros de conexión.' });
  const conn = new Client();
  const connectionId = `${vpsIp}_${Date.now()}`;
  conn.on('ready', () => {
    sshConnections.set(connectionId, { conn, sshUser, vpsIp });
    res.json({ success: true, connectionId });
  }).on('error', (err) => {
    res.status(500).json({ message: 'Error de conexión SSH: ' + err.message });
  }).on('end', () => sshConnections.delete(connectionId))
    .connect({ host: vpsIp, port: 22, username: sshUser, privateKey: sshKey, readyTimeout: 30000 });
});

app.post('/api/disconnect', (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (sshData) {
    sshData.conn.end();
    sshConnections.delete(connectionId);
  }
  res.json({ success: true, message: 'Desconectado.' });
});

// =============================
// Instalación del servidor
// =============================
app.post('/api/install-server', async (req, res) => {
  const { connectionId, serverType, mcVersion, properties, minRam, maxRam } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });

  const propertiesString = Object.entries(properties || {})
    .map(([k, v]) => `${k.replace(/-/g, '.')}=${v}`)
    .join('\\n');

  const minRamSafe = /^\d+[MG]$/.test(minRam) ? minRam : '4G';
  const maxRamSafe = /^\d+[MG]$/.test(maxRam) ? maxRam : '8G';

  const serviceScript = (await fs.readFile(path.join(__dirname, 'scripts', 'installer.sh'), 'utf8'))
    .replace(/\$\{/g, '\\${');

  const installScript = `
#!/bin/bash
set -e
LOG_FILE=/home/${sshData.sshUser}/install.log
rm -f "$LOG_FILE"
touch "$LOG_FILE"
exec 3>&1
exec >>"$LOG_FILE" 2>&1

log(){ echo "$1"; echo "$1" >&3; }
trap 'log "[ERROR] Línea $LINENO: fallo inesperado. Revisa $LOG_FILE"' ERR

SERVER_DIR=${SERVER_PATH_BASE(sshData.sshUser)}
JAR_NAME="server.jar"

log "--- Iniciando Instalación (Tipo: ${serverType}, Versión: ${mcVersion}) ---"
log "Paso 1/6: Limpiando instalación anterior."
sudo systemctl stop minecraft &>/dev/null || log "Info: Servicio no activo."
sudo systemctl disable minecraft &>/dev/null || log "Info: Servicio no habilitado."
sudo rm -f /etc/systemd/system/minecraft.service
sudo systemctl daemon-reload
sudo systemctl reset-failed
rm -rf $SERVER_DIR
mkdir -p $SERVER_DIR
cd $SERVER_DIR
log "Limpieza completada."

log "Paso 2/6: Instalando dependencias del sistema..."
sudo apt-get update
sudo apt-get install -y openjdk-21-jdk wget jq screen ufw
log "Dependencias instaladas."

log "Paso 2.5: Configurando firewall del sistema operativo (UFW)..."
sudo ufw allow 22/tcp
sudo ufw allow 25565/tcp
sudo ufw allow 25565/udp
sudo ufw --force enable
log "Firewall del sistema operativo configurado y activado."

log "Paso 2.6: Configurando permisos de reinicio..."
echo "${sshData.sshUser} ALL=(ALL) NOPASSWD: /sbin/reboot" | sudo tee /etc/sudoers.d/99-minecraft-manager-reboot >/dev/null
log "Permisos de reinicio configurados."

log "Paso 3/6: Descargando archivos del servidor (esto puede tardar)..."
if [ "${serverType}" == "vanilla" ]; then
  MANIFEST_URL=$(curl -s https://piston-meta.mojang.com/mc/game/version_manifest_v2.json | jq -r --arg ver "${mcVersion}" '.versions[] | select(.id == $ver) | .url')
  DOWNLOAD_URL=$(curl -s $MANIFEST_URL | jq -r '.downloads.server.url')
  wget --show-progress -O server.jar $DOWNLOAD_URL
elif [ "${serverType}" == "paper" ]; then
  BUILD=$(curl -s https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds | jq -r '.builds[-1].build')
  DOWNLOAD_URL="https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/\${BUILD}/downloads/paper-${mcVersion}-\${BUILD}.jar"
  wget --show-progress -O server.jar "$DOWNLOAD_URL"
elif [ "${serverType}" == "fabric" ]; then
  FABRIC_INSTALLER_URL=$(curl -s "https://meta.fabricmc.net/v2/versions/installer" | jq -r '.[0].url')
  wget --show-progress -O fabric-installer.jar "$FABRIC_INSTALLER_URL"
  java -jar fabric-installer.jar server -mcversion ${mcVersion} -downloadMinecraft
  JAR_NAME="fabric-server-launch.jar"
fi
log "Descarga completada."

log "Paso 4/6: Configurando archivos del servidor..."
echo -e "${propertiesString}" > server.properties
echo "enable-rcon=false" >> server.properties

log "Paso 4.5/6: Aceptando el EULA de Minecraft..."
java -Xmx1024M -Xms1024M -jar \${JAR_NAME} nogui &
PID=$!
sleep 15
kill $PID || true

if [ -f "eula.txt" ]; then
  sed -i 's/eula=false/eula=true/g' eula.txt
  log "EULA aceptado."
else
  log "No se pudo encontrar eula.txt. El servidor podría no iniciarse."
fi

log "Paso 5/6: Creando script de inicio (start.sh)..."
cat > start.sh << _SCRIPT
#!/bin/bash
/usr/bin/java -Xmx${maxRamSafe} -Xms${minRamSafe} -jar \${JAR_NAME} nogui
_SCRIPT
chmod +x start.sh

log "Paso 6/6: Creando servicio de systemd..."
mkdir -p scripts
cat <<'EOF_INSTALLER' > scripts/installer.sh
${serviceScript}
EOF_INSTALLER
chmod +x scripts/installer.sh
JAR_NAME="$JAR_NAME" MIN_RAM=${minRamSafe} MAX_RAM=${maxRamSafe} MC_USER="${sshData.sshUser}" MC_DIR="$SERVER_DIR" bash scripts/installer.sh
SERVER_IP=$(curl -s ifconfig.me)
SERVER_PORT=$(grep -E '^server-port=' server.properties | cut -d= -f2)
SERVER_NAME=$(grep -E '^server-name=' server.properties | cut -d= -f2)
SERVER_MOTD=$(grep -E '^motd=' server.properties | cut -d= -f2)
log "__INSTALL_DONE__ IP=\${SERVER_IP} PORT=\${SERVER_PORT} NAME=\${SERVER_NAME} MOTD=\${SERVER_MOTD}"
`;

  execSshCommand(sshData.conn, installScript, res).catch(err => {
    if (!res.writableEnded) res.end(`\nERROR al iniciar el script: ${err.message}`);
  });
});

// =============================
// Gestión del servidor
// =============================
app.post('/api/server-control', async (req, res) => {
  const { connectionId, action } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  const lockFilePath = `${SERVER_PATH_BASE(sshData.sshUser)}/world/session.lock`;
  const commands = {
    start: `rm -f ${lockFilePath} && sudo systemctl start minecraft`,
    stop: 'sudo systemctl stop minecraft',
    restart: `sudo systemctl stop minecraft && rm -f ${lockFilePath} && sudo systemctl start minecraft`,
    status: 'sudo systemctl status minecraft --no-pager'
  };

  const command = commands[action];
  if (!command) return res.status(400).json({ message: 'Acción no válida.' });

  try {
    const { output, error } = await execSshCommand(sshData.conn, command);
    res.json({ success: true, output: output || error });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/server-status', async (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  try {
    const { output } = await execSshCommand(sshData.conn, 'systemctl is-active --quiet minecraft && echo "ACTIVE" || echo "INACTIVE"');
    res.json({ success: true, isActive: output.trim() === 'ACTIVE' });
  } catch {
    res.json({ success: true, isActive: false });
  }
});

app.post('/api/send-command', async (req, res) => {
  const { connectionId, command } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  if (!command) return res.status(400).json({ message: 'El comando no puede estar vacío.' });

  const screenCommand = `/usr/bin/screen -S minecraft -p 0 -X stuff "${escapeForScreen(command)}\r"`;

  try {
    await execSshCommand(sshData.conn, screenCommand);
    res.json({ success: true, message: `Comando '${command}' enviado.` });
  } catch (err) {
    res.status(500).json({ message: `Error al enviar comando. ¿Está el servidor activo? Detalles: ${err.message}` });
  }
});

// =============================
// Logs y Recursos
// =============================
app.get('/api/get-latest-log', async (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const logPath = `${SERVER_PATH_BASE(sshData.sshUser)}/logs/latest.log`;
  try {
    const { output } = await execSshCommand(sshData.conn, `cat ${logPath}`);
    res.json({ success: true, logContent: output });
  } catch (error) {
    res.status(500).json({ message: `No se pudo leer el log: ${error.message}` });
  }
});

app.get('/api/get-screen-log', async (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const basePath = SERVER_PATH_BASE(sshData.sshUser);
  const command = `if [ -f ${basePath}/screen.log ]; then cat ${basePath}/screen.log; elif [ -f ${basePath}/screenlog.0 ]; then cat ${basePath}/screenlog.0; else echo '__NO_LOG_FILE__'; fi`;
  try {
    const { output } = await execSshCommand(sshData.conn, command);
    if (output.includes('__NO_LOG_FILE__')) {
      res.status(404).json({ message: 'No se encontró el archivo de log de la consola.' });
    } else {
      res.json({ success: true, logContent: output });
    }
  } catch (error) {
    res.status(500).json({ message: `No se pudo leer el log de screen: ${error.message}` });
  }
});

app.get('/api/get-vps-log', async (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const serverDir = SERVER_PATH_BASE(sshData.sshUser);
  const installLog = `/home/${sshData.sshUser}/install.log`;
  const screenLog = `${serverDir}/screen.log`;
  const command = `if [ -f ${screenLog} ]; then cat ${installLog} ${screenLog}; else cat ${installLog}; fi`;
  try {
    const { output } = await execSshCommand(sshData.conn, command);
    res.json({ success: true, logContent: output });
  } catch (error) {
    res.status(500).json({ message: `No se pudo leer los logs del VPS: ${error.message}` });
  }
});

app.get('/api/download-install-log', (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const remotePath = `/home/${sshData.sshUser}/install.log`;
  sshData.conn.sftp((err, sftp) => {
    if (err) return res.status(500).json({ message: 'Error SFTP.' });
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename=install.log');
    const stream = sftp.createReadStream(remotePath);
    stream.on('error', error => res.status(500).end(`Error al leer log: ${error.message}`));
    stream.pipe(res);
  });
});

app.get('/api/export-server', async (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const serverDir = SERVER_PATH_BASE(sshData.sshUser);
  const archive = `${serverDir}/server-backup.tar.gz`;
  try {
    await execSshCommand(sshData.conn, `tar -czf ${archive} -C ${serverDir} .`);
    sshData.conn.sftp((err, sftp) => {
      if (err) return res.status(500).json({ message: 'Error SFTP.' });
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename=server-backup.tar.gz');
      const stream = sftp.createReadStream(archive);
      stream.on('close', () => sftp.unlink(archive, () => {}));
      stream.pipe(res);
    });
  } catch (error) {
    res.status(500).json({ message: `No se pudo exportar el servidor: ${error.message}` });
  }
});

app.post('/api/list-files', async (req, res) => {
  const { connectionId, dir = '' } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const baseDir = SERVER_PATH_BASE(sshData.sshUser);
  const safeRel = path.posix.normalize('/' + dir).replace(/^\/+/, '');
  const targetDir = path.posix.join(baseDir, safeRel);
  if (!targetDir.startsWith(baseDir)) return res.status(400).json({ message: 'Ruta no permitida.' });
  try {
    const escaped = targetDir.replace(/'/g, "'\\''");
    const cmd = `find '${escaped}' -maxdepth 1 -mindepth 1 -printf '%f\t%y\n'`;
    const { output } = await execSshCommand(sshData.conn, cmd);
    const entries = output.trim() ? output.trim().split('\n').filter(Boolean).map(line => {
      const [name, type] = line.split('\t');
      return { name, type: type === 'd' ? 'dir' : 'file' };
    }) : [];
    res.json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ message: `No se pudo listar el directorio: ${error.message}` });
  }
});

app.get('/api/download-file', (req, res) => {
  const { connectionId, file } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const baseDir = SERVER_PATH_BASE(sshData.sshUser);
  const safeRel = path.posix.normalize('/' + (file || '')).replace(/^\/+/, '');
  const targetFile = path.posix.join(baseDir, safeRel);
  if (!targetFile.startsWith(baseDir)) return res.status(400).json({ message: 'Ruta no permitida.' });
  sshData.conn.sftp((err, sftp) => {
    if (err) return res.status(500).json({ message: 'Error SFTP.' });
    const stream = sftp.createReadStream(targetFile);
    stream.on('error', e => res.status(500).end(`Error al leer archivo: ${e.message}`));
    res.setHeader('Content-Disposition', `attachment; filename=${path.basename(targetFile)}`);
    stream.pipe(res);
  });
});

app.get('/api/screen-logs', (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).end('Conexión no encontrada.');
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const heartbeat = setInterval(() => res.write(':ping\n\n'), 15000);
  const basePath = SERVER_PATH_BASE(sshData.sshUser);
  const command = `if [ -f ${basePath}/screen.log ]; then tail -F -n 50 ${basePath}/screen.log; elif [ -f ${basePath}/screenlog.0 ]; then tail -F -n 50 ${basePath}/screenlog.0; else echo '__NO_LOG_FILE__'; fi`;
  sshData.conn.exec(command, (err, stream) => {
    if (err) {
      res.write(`data: [ERROR] No se pudo acceder al archivo de logs.\n\n`);
      res.end();
      return;
    }
    stream.on('data', data => {
      data.toString().split('\n').forEach(line => {
        if (!line.trim()) return;
        if (line.trim() === '__NO_LOG_FILE__') {
          res.write(`data: [ERROR] No se encontró el archivo de logs.\n\n`);
          stream.close();
          res.end();
        } else {
          res.write(`data: ${line}\n\n`);
        }
      });
    })
    .stderr.on('data', data => res.write(`data: [ERROR LOGS]: ${data.toString().trim()}\n\n`))
    .on('close', () => res.end());
    req.on('close', () => { clearInterval(heartbeat); stream.close(); });
  });
});

app.get('/api/system-logs', (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).end('Conexión no encontrada.');
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const heartbeat = setInterval(() => res.write(':ping\n\n'), 15000);
  const serverDir = SERVER_PATH_BASE(sshData.sshUser);
  const installLog = `/home/${sshData.sshUser}/install.log`;
  const command = `if [ -f ${serverDir}/screen.log ]; then tail -F -n 50 ${installLog} ${serverDir}/screen.log; else tail -F -n 50 ${installLog}; fi`;
  sshData.conn.exec(command, (err, stream) => {
    if (err) {
      res.write(`data: [ERROR] No se pudo acceder a los logs.\n\n`);
      res.end();
      return;
    }
    stream.on('data', data => {
      data.toString().split('\n').forEach(line => {
        if (!line.trim()) return;
        const header = line.match(/^==> (.*) <==$/);
        if (header) {
          res.write(`data: [${path.basename(header[1])}]\n\n`);
        } else {
          res.write(`data: ${line}\n\n`);
        }
      });
    })
    .stderr.on('data', data => res.write(`data: [ERROR LOGS]: ${data.toString().trim()}\n\n`))
    .on('close', () => res.end());
    req.on('close', () => { clearInterval(heartbeat); stream.close(); });
  });
});

app.get('/api/get-resources', async (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  const command = `
    CPU_USAGE=$( (command -v mpstat >/dev/null 2>&1 && LC_ALL=C mpstat 1 1 | awk '/Average/ {print 100 - $12}') || \
  (LC_ALL=C top -bn1 | awk -v FS='[ ,]+' '/Cpu\\(s\\)/ {for(i=1;i<=NF;i++) if ($i=="id") {print 100-$(i-1)}}') )
    RAM_DATA=$(free -m | awk '/Mem:/ {print $3"/"$2}')
    DISK_DATA=$(df -h / | awk 'NR==2 {print $3"/"$2" "$5}')
    echo CPU_USAGE=${'${CPU_USAGE}'} RAM_DATA=${'${RAM_DATA}'} DISK_DATA=${'${DISK_DATA}'}
  `;

  try {
    const { output } = await execSshCommand(sshData.conn, command);
    const data = output.trim().split(/\s+/).reduce((acc, kv) => {
      const [k, v] = kv.split('=');
      if (k) acc[k] = v;
      return acc;
    }, {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: `No se pudieron obtener los recursos: ${error.message}` });
  }
});

// =============================
// server.properties
// =============================
app.get('/api/get-properties', async (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const filePath = `${SERVER_PATH_BASE(sshData.sshUser)}/server.properties`;
  try {
    const { output } = await execSshCommand(sshData.conn, `cat ${filePath}`);
    const properties = output.split('\n').reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const [key, ...valueParts] = trimmed.split('=');
      const keyForUi = key.trim().replace(/\./g, '-');
      const value = valueParts.join('=').trim();
      acc[keyForUi] = value;
      return acc;
    }, {});
    res.json({ success: true, properties });
  } catch (error) {
    res.status(500).json({ message: `Error al leer server.properties: ${error.message}` });
  }
});

app.post('/api/save-properties', async (req, res) => {
  const { connectionId, properties } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData || !properties) return res.status(400).json({ message: 'Faltan parámetros.' });

  const propsString = Object.entries(properties)
    .map(([k, v]) => `${k.replace(/-/g, '.')}=${v}`)
    .join('\n');
  const escaped = propsString.replace(/[\\`$]/g, '\\$&');
  const filePath = `${SERVER_PATH_BASE(sshData.sshUser)}/server.properties`;

  try {
    await execSshCommand(sshData.conn, `printf \"%b\" \"${escaped}\\n\" > ${filePath}`);
    res.json({ success: true, message: 'server.properties guardado.' });
  } catch (error) {
    res.status(500).json({ message: `Error al guardar server.properties: ${error.message}` });
  }
});

// =============================
// Gestión de jugadores
// =============================
app.get('/api/get-players', async (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  const SERVER_PATH = SERVER_PATH_BASE(sshData.sshUser);
  const command = `
    cd ${SERVER_PATH} || exit 0;
    [ -f ${SERVER_PATH}/ops.json ] && cat ${SERVER_PATH}/ops.json || echo "[]"
    echo "---SPLIT---"
    [ -f ${SERVER_PATH}/whitelist.json ] && cat ${SERVER_PATH}/whitelist.json || echo "[]"
  `;
  try {
    const { output } = await execSshCommand(sshData.conn, command);
    const [opsStr, whitelistStr] = output.split('---SPLIT---');
    const ops = JSON.parse((opsStr || '[]').trim());
    const whitelist = JSON.parse((whitelistStr || '[]').trim());
    res.json({ success: true, ops, whitelist });
  } catch (error) {
    res.status(500).json({ message: `Error al obtener listas de jugadores: ${error.message}` });
  }
});

app.post('/api/manage-player', async (req, res) => {
  const { connectionId, action, list, username } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData || !action || !list || !username) {
    return res.status(400).json({ message: 'Faltan parámetros.' });
  }

  const commandMap = {
    'ops-add': `op ${username}`,
    'ops-remove': `deop ${username}`,
    'whitelist-add': `whitelist add ${username}`,
    'whitelist-remove': `whitelist remove ${username}`,
  };
  const serverCommand = commandMap[`${list}-${action}`];
  if (!serverCommand) return res.status(400).json({ message: 'Acción no válida.' });

  const screenCmd = `/usr/bin/screen -p 0 -S minecraft -X eval "stuff \\\"${escapeForScreen(serverCommand)}\\\\015\\""`;
  const reloadWhitelist = `/usr/bin/screen -p 0 -S minecraft -X eval "stuff \\\"whitelist reload\\\\015\\""`;

  try {
    await execSshCommand(sshData.conn, screenCmd);
    if (list === 'whitelist') await execSshCommand(sshData.conn, reloadWhitelist);
    res.json({ success: true, message: 'OK' });
  } catch (error) {
    res.status(500).json({ message: `Error al gestionar jugador: ${error.message}` });
  }
});

// =============================
// Copias de seguridad
// =============================
app.post('/api/backups', async (req, res) => {
  const { connectionId, action, file } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData || !action) return res.status(400).json({ message: 'Faltan parámetros.' });

  const SERVER_PATH = SERVER_PATH_BASE(sshData.sshUser);
  const BACKUP_PATH = `${SERVER_PATH}/backups`;
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });

  try {
    if (action === 'list') {
      const { output } = await execSshCommand(
        sshData.conn,
        `mkdir -p ${BACKUP_PATH}; ls -lh --time-style=\"+%Y-%m-%d %H:%M:%S\" ${BACKUP_PATH} | awk 'NR>1 {print $9"|" $6"|" $7"|" $5}'`
      );
      const backups = output.trim().split('\n').filter(Boolean).map(line => {
        const [name, date, time, size] = line.split('|');
        return { name, date, time, size };
      });
      return res.end(JSON.stringify({ success: true, backups }));
    }

    if (action === 'delete') {
      if (!file || file.includes('..') || file.includes('/')) throw new Error('Nombre de archivo no válido.');
      await execSshCommand(sshData.conn, `rm -f ${BACKUP_PATH}/${file}`);
      return res.end(JSON.stringify({ success: true, message: `Copia '${file}' eliminada.` }));
    }

    if (action === 'create' || action === 'restore') {
      let script = `set -e\n`;
      if (action === 'create') {
        const nowTag = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `backup_${nowTag}.tar.gz`;
        script += `
echo "--- Creando Copia de Seguridad ---"
sudo systemctl stop minecraft || true
mkdir -p ${BACKUP_PATH}
cd ${SERVER_PATH}
tar -czf ${BACKUP_PATH}/${backupFile} world || true
sudo systemctl start minecraft || true
echo "--- Copia de Seguridad Creada: ${backupFile} ---"
`;
      } else {
        if (!file || file.includes('..') || file.includes('/')) throw new Error('Nombre de archivo no válido.');
        script += `
echo "--- Restaurando Copia de Seguridad: ${file} ---"
sudo systemctl stop minecraft || true
cd ${SERVER_PATH}
rm -rf world
tar -xzf ${BACKUP_PATH}/${file}
sudo systemctl start minecraft || true
echo "--- Restauración Finalizada ---"
`;
      }
      await execSshCommand(sshData.conn, script, res);
      return;
    }

    res.end('Acción no válida.');
  } catch (error) {
    res.end(`\nERROR: ${error.message}`);
  }
});

// =============================
// Firewall
// =============================
app.post('/api/open-ufw', (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  const script = `
echo "--- Configurando UFW en el VPS ---"
sudo ufw allow 22/tcp
sudo ufw allow 25565/tcp
sudo ufw allow 25565/udp
sudo ufw --force enable
echo "Reglas activas:"
sudo ufw status numbered
echo "--- Listo ---"
`;

  execSshCommand(sshData.conn, script, res).catch(err => {
    if (!res.writableEnded) res.end(`\nERROR: ${err.message}`);
  });
});

app.post('/api/open-oci-firewall', async (req, res) => {
  const { compartmentId, vcnId } = req.body;
  if (!compartmentId) {
    return res.status(400).json({ success: false, message: 'El OCID del Compartimento es obligatorio' });
  }
  try {
    let finalVcnId = vcnId;
    if (!finalVcnId) {
      const vcnListCmd = `oci network vcn list --compartment-id "${compartmentId}" --query "data[0].id" --raw-output`;
      const { stdout: foundVcnId } = await execAsync(vcnListCmd, { timeout: 30000 });
      if (!foundVcnId) return res.status(404).json({ success: false, message: 'No se encontraron VCNs en el compartimento' });
      finalVcnId = foundVcnId.trim();
    }

    const listCommand = `oci network security-list list --compartment-id "${compartmentId}" --vcn-id "${finalVcnId}" --all`;
    const { stdout: listJson } = await execAsync(listCommand, { timeout: 30000 });

    let securityLists = [];
    if (listJson && listJson.trim() !== '') {
      try {
        const parsed = JSON.parse(listJson);
        securityLists = parsed.data || [];
      } catch {
        throw new Error('Respuesta inválida desde la CLI de OCI.');
      }
    }
    if (securityLists.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontraron listas de seguridad' });
    }

    const defaultList = securityLists.find(list => (list['display-name'] || '').toLowerCase().includes('default')) || securityLists[0];
    const securityListId = defaultList.id;
    let ingressRules = defaultList['ingress-security-rules'] || [];

    const tcpExists = ingressRules.some(r => r.protocol === '6' && r['tcp-options']?.['destination-port-range']?.min === 25565);
    const udpExists = ingressRules.some(r => r.protocol === '17' && r['udp-options']?.['destination-port-range']?.min === 25565);

    if (tcpExists && udpExists) {
      return res.json({ success: true, message: 'El firewall ya está configurado para Minecraft (puerto 25565)' });
    }
    if (!tcpExists) {
      ingressRules.push({
        protocol: '6', source: '0.0.0.0/0', isStateless: false,
        'tcp-options': { 'destination-port-range': { min: 25565, max: 25565 } },
        description: 'Minecraft Server TCP'
      });
    }
    if (!udpExists) {
      ingressRules.push({
        protocol: '17', source: '0.0.0.0/0', isStateless: false,
        'udp-options': { 'destination-port-range': { min: 25565, max: 25565 } },
        description: 'Minecraft Server UDP'
      });
    }

    const tempFile = path.join(os.tmpdir(), `oci-rules-${Date.now()}.json`);
    await fs.writeFile(tempFile, JSON.stringify({ 'ingress-security-rules': ingressRules }));
    const updateCmd = `oci network security-list update --security-list-id "${securityListId}" --from-json file://${tempFile} --force`;
    await execAsync(updateCmd, { timeout: 30000 });
    await fs.unlink(tempFile);

    res.json({ success: true, message: 'Firewall de OCI configurado correctamente para Minecraft (puerto 25565 TCP/UDP)' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al configurar el firewall de OCI', error: error.stderr || error.message });
  }
});

// =============================
// Comandos rápidos de la VPS
// =============================
app.post('/api/server/control', async (req, res) => {
  const { connectionId, action } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  const mapping = { start: 'START_SERVER', stop: 'STOP_SERVER', restart: 'RESTART_SERVER' };
  const commandKey = mapping[action];
  if (!commandKey) return res.status(400).json({ message: 'Acción inválida.' });

  try {
    await executeSecureCommand(sshData.conn, commandKey);
    res.json({ success: true, message: `Comando ${action} ejecutado.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/ban', async (req, res) => {
  const { connectionId, playerName } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  try {
    await executeSecureCommand(sshData.conn, 'BAN_PLAYER', [playerName]);
    res.json({ success: true, message: `Jugador ${playerName} baneado.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/clear-console', async (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const serverDir = SERVER_PATH_BASE(sshData.sshUser);
  const cmd = `> /home/${sshData.sshUser}/install.log; if [ -f ${serverDir}/screen.log ]; then > ${serverDir}/screen.log; fi`;
  try {
    await execSshCommand(sshData.conn, cmd);
    res.json({ success: true, message: 'Consola limpiada.' });
  } catch (error) {
    res.status(500).json({ message: `Error al limpiar consola: ${error.message}` });
  }
});

// =============================
// Explorador de archivos
// =============================
app.get('/api/files', async (req, res) => {
  try {
    const dirPath = resolveSafePath(req.query.path || '');
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
      const full = path.join(dirPath, entry.name);
      const stats = await fs.stat(full);
      return { name: entry.name, size: stats.size, isDirectory: entry.isDirectory() };
    }));
    res.json({ success: true, files });
  } catch (err) {
    res.status(err.message === 'Ruta no permitida.' ? 400 : 500).json({ message: err.message });
  }
});

app.get('/api/files/download', async (req, res) => {
  let filePath;
  try {
    filePath = resolveSafePath(req.query.path || '');
    await fs.access(filePath);
    res.download(filePath);
  } catch (err) {
    const status = err.code === 'ENOENT' ? 404 : 400;
    res.status(status).json({ message: status === 404 ? 'Archivo no encontrado.' : err.message });
  }
});

app.delete('/api/files', async (req, res) => {
  try {
    const target = resolveSafePath(req.query.path || '');
    const stats = await fs.lstat(target);
    if (stats.isDirectory()) {
      await fs.rm(target, { recursive: true, force: true });
    } else {
      await fs.unlink(target);
    }
    res.json({ success: true, message: 'Elemento eliminado.' });
  } catch (err) {
    res.status(err.message === 'Ruta no permitida.' ? 400 : 500).json({ message: err.message });
  }
});

app.post('/api/reboot-vps', async (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  try {
    await executeSecureCommand(sshData.conn, 'REBOOT_VPS');
    res.json({ success: true, message: 'VPS reiniciándose.' });
  } catch (error) {
    res.status(500).json({ message: `Error al reiniciar VPS: ${error.message}` });
  }
});

// =============================
// Limpieza profunda
// =============================
app.post('/api/deep-clean', async (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  try {
    const uninstallScript = (await fs.readFile(path.join(__dirname, 'scripts', 'uninstall.sh'), 'utf8'))
      .replace(/\$\{/g, '\\${');
    const remoteScript = `
cat <<'EOF_UNINSTALL' > /home/${sshData.sshUser}/uninstall.sh
${uninstallScript}
EOF_UNINSTALL
chmod +x /home/${sshData.sshUser}/uninstall.sh
sudo /home/${sshData.sshUser}/uninstall.sh
rm /home/${sshData.sshUser}/uninstall.sh
`;
    const { output, error } = await execSshCommand(sshData.conn, remoteScript);
    res.json({ success: true, output: output || error });
  } catch (error) {
    res.status(500).json({ message: `Error en limpieza: ${error.message}` });
  }
});

process.on('SIGINT', () => {
  sshConnections.forEach(data => data.conn.end());
  process.exit();
});

app.listen(port, () => console.log(`Servidor escuchando en http://localhost:${port}`));
