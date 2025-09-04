const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { Client } = require('ssh2');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const port = 3000;
const execAsync = promisify(exec);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

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

// =============================
// Guías y Versiones
// =============================
app.get('/api/get-guide', async (req, res) => {
  const { file } = req.query;
  if (!file || !['guia_vps_oci.md', 'guia_oci_cli.md', 'guia_minecraft_manual.md'].includes(file)) {
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
app.post('/api/install-server', (req, res) => {
  const { connectionId, serverType, mcVersion, properties } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });

  const propertiesString = Object.entries(properties || {})
    .map(([k, v]) => `${k.replace(/-/g, '.')}=${v}`)
    .join('\\n');

  const installScript = `
#!/bin/bash
set -e
exec > >(tee /dev/tty) 2>&1

SERVER_DIR=${SERVER_PATH_BASE(sshData.sshUser)}
JAR_NAME="server.jar"

echo "--- Iniciando Instalación (Tipo: ${serverType}, Versión: ${mcVersion}) ---"
echo "Paso 1: Limpiando instalación anterior..."
sudo systemctl stop minecraft &>/dev/null || echo "Info: Servicio no activo."
sudo systemctl disable minecraft &>/dev/null || echo "Info: Servicio no habilitado."
sudo rm -f /etc/systemd/system/minecraft.service
sudo systemctl daemon-reload
sudo systemctl reset-failed
rm -rf $SERVER_DIR
mkdir -p $SERVER_DIR
cd $SERVER_DIR
echo "Limpieza completada."

echo "Paso 2: Instalando dependencias (Java 21, wget, jq, screen, ufw)..."
sudo apt-get update > /dev/null
sudo apt-get install -y openjdk-21-jdk wget jq screen ufw > /dev/null
echo "Dependencias instaladas."

echo "Paso 2.5: Configurando firewall del sistema operativo (UFW)..."
sudo ufw allow 22/tcp
sudo ufw allow 25565/tcp
sudo ufw allow 25565/udp
sudo ufw --force enable
echo "Firewall del sistema operativo configurado y activado."

echo "Paso 3: Descargando archivos del servidor..."
if [ "${serverType}" == "vanilla" ]; then
  MANIFEST_URL=$(curl -s https://piston-meta.mojang.com/mc/game/version_manifest_v2.json | jq -r ".versions[] | select(.id == \"${mcVersion}\") | .url")
  DOWNLOAD_URL=$(curl -s $MANIFEST_URL | jq -r ".downloads.server.url")
  wget -q --show-progress -O server.jar $DOWNLOAD_URL
elif [ "${serverType}" == "paper" ]; then
  BUILD=$(curl -s https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds | jq -r '.builds[-1].build')
  DOWNLOAD_URL="https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/\${BUILD}/downloads/paper-${mcVersion}-\${BUILD}.jar"
  wget -q --show-progress -O server.jar "$DOWNLOAD_URL"
elif [ "${serverType}" == "fabric" ]; then
  FABRIC_INSTALLER_URL=$(curl -s "https://meta.fabricmc.net/v2/versions/installer" | jq -r '.[0].url')
  wget -q --show-progress -O fabric-installer.jar "$FABRIC_INSTALLER_URL"
  java -jar fabric-installer.jar server -mcversion ${mcVersion} -downloadMinecraft
  JAR_NAME="fabric-server-launch.jar"
fi
echo "Descarga completada."

echo "Paso 4: Configurando archivos del servidor..."
echo "eula=true" > eula.txt
echo -e "${propertiesString}" > server.properties
echo "enable-rcon=false" >> server.properties

echo "Paso 5: Creando script de inicio (start.sh)..."
cat > start.sh << '_SCRIPT'
#!/bin/bash
java -Xms4G -Xmx20G -jar \${JAR_NAME} nogui
_SCRIPT
chmod +x start.sh

echo "Paso 6: Creando servicio de systemd con screen..."
sudo tee /etc/systemd/system/minecraft.service > /dev/null << '_SERVICE'
[Unit]
Description=Minecraft Server (${serverType} ${mcVersion})
After=network.target
[Service]
User=${sshData.sshUser}
Nice=1
KillMode=none
SuccessExitStatus=0 1
WorkingDirectory=$SERVER_DIR
ExecStart=/usr/bin/screen -S minecraft -d -m /bin/bash $SERVER_DIR/start.sh
ExecStop=/usr/bin/screen -p 0 -S minecraft -X eval "stuff \"stop\\015\""
[Install]
WantedBy=multi-user.target
_SERVICE

sudo systemctl daemon-reload
sudo systemctl enable minecraft
echo "Servicio creado y habilitado."
echo "--- Instalación Finalizada ---"
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

  const screenCommand = `/usr/bin/screen -p 0 -S minecraft -X eval "stuff \\\"${escapeForScreen(command)}\\\\015\\""`;

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

app.get('/api/live-logs', (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).end('Conexión no encontrada.');
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const heartbeat = setInterval(() => res.write(':ping\n\n'), 15000);
  const command = `tail -F -n 50 ${SERVER_PATH_BASE(sshData.sshUser)}/logs/latest.log`;
  sshData.conn.exec(command, (err, stream) => {
    if (err) {
      res.write(`data: [ERROR] No se pudo acceder al archivo de logs.\n\n`);
      res.end();
      return;
    }
    stream.on('data', data => data.toString().split('\n').forEach(line => line.trim() && res.write(`data: ${line}\n\n`)))
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
// Limpieza profunda
// =============================
app.post('/api/deep-clean', async (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  const script = `
echo "--- Limpieza Profunda ---"
sudo systemctl stop minecraft || echo "Info: Servicio no activo."
sudo systemctl disable minecraft || echo "Info: Servicio no habilitado."
sudo rm -f /etc/systemd/system/minecraft.service
sudo systemctl daemon-reload
sudo systemctl reset-failed
rm -rf ${SERVER_PATH_BASE(sshData.sshUser)}
echo "Carpeta del servidor eliminada."
echo "--- Limpieza Completada ---"
`;
  try {
    const { output, error } = await execSshCommand(sshData.conn, script);
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
