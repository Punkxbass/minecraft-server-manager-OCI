// server.js — Backend stable for "Minecraft Server Manager OCI"
// Requisitos: Node 18+ (fetch nativo), express, cors, ssh2, marked

const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const { Client } = require('ssh2');
const { marked } = require('marked');

const fetch = global.fetch; // Node >=18

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir estáticos (Index.html / script.js) desde la carpeta del proyecto
app.use(express.static(path.join(__dirname)));

const sshConnections = new Map();
const SERVER_PATH_BASE = (user) => `/home/${user}/minecraft-server`;

// ---------- Helper SSH ----------
function execSshCommand(conn, command, streamRes = null) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        if (streamRes && !streamRes.headersSent) {
          streamRes.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });
          streamRes.end(`\nERROR: ${err.message}`);
          return;
        }
        return reject(err);
      }

      let output = '';
      let errorOutput = '';

      if (streamRes && !streamRes.headersSent) {
        streamRes.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });
      }

      stream
        .on('close', (code) => {
          if (streamRes && !streamRes.writableEnded) {
            streamRes.end();
          }
          if (code === 0) resolve({ output });
          else reject(new Error(errorOutput || output || `Exit code ${code}`));
        })
        .on('data', (data) => {
          const text = data.toString();
          output += text;
          if (streamRes) streamRes.write(text);
        })
        .stderr.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          if (streamRes) streamRes.write(text);
        });
    });
  });
}

function escapeForScreen(cmd) {
  return String(cmd).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

// ---------- Guías (Markdown -> HTML) ----------
app.get('/api/get-guide', async (req, res) => {
  const { file } = req.query;
  if (!file || !['guia_vps_oci.md', 'guia_oci_cli.md', 'guia_minecraft_manual.md'].includes(file)) {
    return res.status(400).json({ message: 'Archivo de guía no válido.' });
  }
  try {
    const filePath = path.join(__dirname, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const htmlContent = marked.parse(content);
    res.json({ success: true, content: htmlContent });
  } catch (error) {
    res.status(404).json({ message: `El archivo de la guía '${file}' no se encontró.` });
  }
});

// ---------- Conectar / Desconectar ----------
app.post('/api/connect', (req, res) => {
  let { vpsIp, username, sshKey } = req.body;
  if (!vpsIp || !username || !sshKey) {
    return res.status(400).json({ message: 'Faltan parámetros de conexión.' });
  }

  vpsIp = String(vpsIp).trim();
  username = String(username).trim();
  sshKey = String(sshKey).replace(/\r/g, '');

  const conn = new Client();
  conn
    .on('ready', () => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sshConnections.set(id, { conn, vpsIp, sshUser: username });
      res.json({ success: true, connectionId: id });
    })
    .on('error', (err) => {
      res.status(500).json({ message: `Error SSH: ${err.message}` });
    })
    .connect({
      host: vpsIp,
      port: 22,
      username,
      privateKey: sshKey,
      readyTimeout: 30000,
    });
});

app.post('/api/disconnect', (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.json({ success: true });
  try {
    sshData.conn.end();
  } catch {}
  sshConnections.delete(connectionId);
  res.json({ success: true });
});

// ---------- Recursos ----------
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
    const data = output
      .trim()
      .split(/\s+/)
      .reduce((acc, kv) => {
        const [k, v] = kv.split('=');
        if (k) acc[k] = v;
        return acc;
      }, {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: `No se pudieron obtener los recursos: ${error.message}` });
  }
});

// ---------- Estado del servicio ----------
app.post('/api/server-status', async (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  try {
    const { output } = await execSshCommand(
      sshData.conn,
      'systemctl is-active --quiet minecraft && echo "ACTIVE" || echo "INACTIVE"'
    );
    res.json({ success: true, isActive: output.trim() === 'ACTIVE' });
  } catch {
    res.json({ success: true, isActive: false });
  }
});

// ---------- Consola en vivo ----------
app.get('/api/live-logs', (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) {
    res.writeHead(400, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    res.write('data: Conexión no encontrada.\n\n');
    res.end();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
  const heartbeat = setInterval(() => res.write(':ping\n\n'), 15000);

  const logPath = `${SERVER_PATH_BASE(sshData.sshUser)}/logs/latest.log`;
  sshData.conn.exec(`tail -F "${logPath}" 2>/dev/null || tail -f /dev/null`, (err, stream) => {
    if (err) {
      res.write(`data: Error abriendo logs: ${err.message}\n\n`);
      res.end();
      return;
    }
    stream
      .on('data', (data) => {
        data
          .toString()
          .split('\n')
          .forEach((line) => line.trim() && res.write(`data: ${line}\n\n`));
      })
      .stderr.on('data', (data) => res.write(`data: [ERROR LOGS]: ${data.toString().trim()}\n\n`))
      .on('close', () => res.end());

    req.on('close', () => { clearInterval(heartbeat); stream.close(); });
  });
});

// ---------- Controles básicos ----------
app.post('/api/server-control', async (req, res) => {
  const { connectionId, action } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  const SERVER_PATH = SERVER_PATH_BASE(sshData.sshUser);
  const lock = `${SERVER_PATH}/world/session.lock`;
  const commands = {
    start: `/usr/bin/screen -S minecraft -X quit || true; \
PIDS=$(ss -ltnp 2>/dev/null | awk '/:25565 / {print $0}' | sed -n 's/.*pid=\\([0-9]\\+\\).*/\\1/p' | sort -u); [ -n "$PIDS" ] && sudo kill -9 $PIDS || true; \
rm -f ${lock}; \
sudo systemctl start minecraft`,
    stop: '/usr/bin/screen -S minecraft -X quit || true; sudo systemctl stop minecraft',
    restart: `sudo systemctl stop minecraft || true; /usr/bin/screen -S minecraft -X quit || true; \
sleep 1; PIDS=$(ss -ltnp 2>/dev/null | awk '/:25565 / {print $0}' | sed -n 's/.*pid=\\([0-9]\\+\\).*/\\1/p' | sort -u); [ -n "$PIDS" ] && sudo kill -9 $PIDS || true; \
rm -f ${lock}; sudo systemctl start minecraft`,
    status: 'sudo systemctl status minecraft --no-pager',
  };

  const cmd = commands[action];
  if (!cmd) return res.status(400).json({ message: 'Acción no válida.' });

  try {
    const { output } = await execSshCommand(sshData.conn, cmd);
    res.json({ success: true, output });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ---------- Enviar comando a la consola ----------
app.post('/api/send-command', async (req, res) => {
  const { connectionId, command } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData || !command) return res.status(400).json({ message: 'Faltan parámetros.' });

  const screenCmd = `/usr/bin/screen -p 0 -S minecraft -X eval "stuff \\"${escapeForScreen(command)}\\\\015\\""`;
  try {
    await execSshCommand(sshData.conn, screenCmd);
    res.json({ success: true, message: `Comando '${command}' enviado.` });
  } catch (err) {
    res.status(500).json({ message: `Error al enviar comando. ¿Está el servidor activo? Detalles: ${err.message}` });
  }
});

// ---------- server.properties (leer/guardar) ----------
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
      if (!key) return acc;
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
    await execSshCommand(sshData.conn, `printf "%b" "${escaped}\\n" > ${filePath}`);
    res.json({ success: true, message: 'server.properties guardado.' });
  } catch (error) {
    res.status(500).json({ message: `Error al guardar server.properties: ${error.message}` });
  }
});

// ---------- Jugadores (ops/whitelist) ----------
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

  const screenCmd = `/usr/bin/screen -p 0 -S minecraft -X eval "stuff \\"${escapeForScreen(serverCommand)}\\\\015\\""`;
  const reloadWhitelist = `/usr/bin/screen -p 0 -S minecraft -X eval "stuff \\"whitelist reload\\\\015\\""`;

  try {
    await execSshCommand(sshData.conn, screenCmd);
    if (list === 'whitelist') await execSshCommand(sshData.conn, reloadWhitelist);
    res.json({ success: true, message: 'OK' });
  } catch (error) {
    res.status(500).json({ message: `Error al gestionar jugador: ${error.message}` });
  }
});

// ---------- Copias de seguridad ----------
app.post('/api/backups', async (req, res) => {
  const { connectionId, action, file } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData || !action) return res.status(400).json({ message: 'Faltan parámetros.' });

  const SERVER_PATH = SERVER_PATH_BASE(sshData.sshUser);
  const BACKUP_PATH = `${SERVER_PATH}/backups`;

  // Para acciones largas, stream
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });

  try {
    if (action === 'list') {
      const { output } = await execSshCommand(
        sshData.conn,
        `mkdir -p ${BACKUP_PATH}; ls -lh --time-style="+%Y-%m-%d %H:%M:%S" ${BACKUP_PATH} | awk 'NR>1 {print $9"|" $6"|" $7"|" $5}'`
      );
      const backups = output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
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
echo "--- Creando Copia de Seguridad ---";
sudo systemctl stop minecraft || true;
mkdir -p ${BACKUP_PATH};
cd ${SERVER_PATH};
tar -czf ${BACKUP_PATH}/${backupFile} world || true;
sudo systemctl start minecraft || true;
echo "--- Copia de Seguridad Creada: ${backupFile} ---";
`;
      } else {
        if (!file || file.includes('..') || file.includes('/')) throw new Error('Nombre de archivo no válido.');
        script += `
echo "--- Restaurando Copia de Seguridad: ${file} ---";
sudo systemctl stop minecraft || true;
cd ${SERVER_PATH};
rm -rf world;
tar -xzf ${BACKUP_PATH}/${file};
sudo systemctl start minecraft || true;
echo "--- Restauración Finalizada ---";
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

// ---------- Versiones ----------
app.get('/api/minecraft-versions', async (req, res) => {
  const { type } = req.query;
  try {
    let versions = [];
    const resp = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const data = await resp.json();
    if (type === 'vanilla' || type === 'paper') {
      versions = data.versions.map((v) => v.id).filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v)).slice(0, 60);
    } else {
      versions = data.versions.map((v) => v.id).slice(0, 60);
    }
    res.json({ success: true, versions });
  } catch (error) {
    res.status(500).json({ message: `No se pudieron obtener las versiones: ${error.message}` });
  }
});

// ---------- Instalador (Vanilla / Paper / Fabric) ----------
app.post('/api/install-server', (req, res) => {
  const { connectionId, serverType, mcVersion, properties } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
  if (!serverType || !mcVersion) return res.status(400).json({ message: 'Faltan parámetros.' });

  const propsString = Object.entries(properties || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const propsEscaped = propsString.replace(/[\\`$]/g, '\\$&').replace(/\n/g, '\\n');

  const SERVER_PATH = SERVER_PATH_BASE(sshData.sshUser);

  const installScript = `
set -e
echo "--- Instalador de Servidor Minecraft (${serverType} ${mcVersion}) ---"
echo "Paso 1: Dependencias..."
sudo apt-get update -y
sudo apt-get install -y openjdk-21-jre-headless unzip screen jq curl wget ufw iproute2 lsof

echo "Paso 2: Limpiando carpeta, servicio y procesos previos..."
sudo systemctl stop minecraft >/dev/null 2>&1 || echo "Info: Servicio no activo."
sudo systemctl disable minecraft >/dev/null 2>&1 || echo "Info: Servicio no habilitado."
sudo rm -f /etc/systemd/system/minecraft.service || true
sudo systemctl daemon-reload || true
/usr/bin/screen -S minecraft -X quit >/dev/null 2>&1 || echo "Info: No había sesión screen."
PIDS=$(sudo ss -ltnp 2>/dev/null | awk '/:25565 / {print $0}' | sed -n 's/.*pid=\\([0-9]\\+\\).*/\\1/p' | sort -u) || true
if [ -n "$PIDS" ]; then
  echo "Matando PIDs en 25565: $PIDS"
  sudo kill -9 $PIDS || true
  sleep 1
fi
pkill -f 'java.*(server\\.jar|fabric-server-launch\\.jar)' || true

rm -rf ${SERVER_PATH}
mkdir -p ${SERVER_PATH}/backups
cd ${SERVER_PATH}

echo "Paso 2.5: Configurando firewall UFW..."
sudo ufw allow 22/tcp
sudo ufw allow 25565/tcp
sudo ufw allow 25565/udp
sudo ufw --force enable

echo "Paso 3: Descarga (${serverType})..."
JAR_NAME="server.jar"
if [ "${serverType}" = "vanilla" ]; then
  MANIFEST_URL=$(curl -s https://piston-meta.mojang.com/mc/game/version_manifest_v2.json | jq -r '.versions[] | select(.id=="'${mcVersion}'") | .url')
if [ -z "$MANIFEST_URL" ] || [ "$MANIFEST_URL" = "null" ]; then
  echo "Error: versión ${mcVersion} no encontrada en el manifest de Mojang."; exit 1;
fi
  DOWNLOAD_URL=$(curl -s "$MANIFEST_URL" | jq -r '.downloads.server.url')
  wget -q --show-progress -O server.jar "$DOWNLOAD_URL"
  JAR_NAME="server.jar"
elif [ "${serverType}" = "paper" ]; then
  BUILD=$(curl -s "https://api.papermc.io/v2/projects/paper/versions/${mcVersion}" | jq -r '.builds[-1]')
  if [ -z "$BUILD" ] || [ "$BUILD" = "null" ]; then
    echo "Error: No se encontró build para Paper ${mcVersion}"; exit 1;
  fi
  DOWNLOAD_URL="https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/\${BUILD}/downloads/paper-${mcVersion}-\${BUILD}.jar"
  wget -q --show-progress -O server.jar "$DOWNLOAD_URL"
  JAR_NAME="server.jar"
else
  FABRIC_INSTALLER_URL=$(curl -s "https://meta.fabricmc.net/v2/versions/installer" | jq -r '.[0].url')
  wget -q --show-progress -O fabric-installer.jar "$FABRIC_INSTALLER_URL"
  java -jar fabric-installer.jar server -mcversion ${mcVersion} -downloadMinecraft
  JAR_NAME="fabric-server-launch.jar"
fi
echo "Descarga completada."

echo "Paso 4: server.properties + EULA..."
echo "eula=true" > eula.txt
printf "%b" "${propsEscaped}\\n" > server.properties
echo "enable-rcon=false" >> server.properties

echo "Paso 5: start.sh..."
cat > start.sh << 'EOF'
#!/bin/bash
set -euo pipefail
JAR_NAME="\${JAR_NAME:-server.jar}"
XMS="\${XMS:-1G}"
XMX="\${XMX:-4G}"
exec /usr/bin/java -Xms"$XMS" -Xmx"$XMX" -jar "$JAR_NAME" nogui
EOF
chmod 755 start.sh

echo "Paso 6: Servicio systemd..."
sudo tee /etc/systemd/system/minecraft.service > /dev/null << EOF
[Unit]
Description=Minecraft Server (${serverType} ${mcVersion})
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
User=${sshData.sshUser}
WorkingDirectory=${SERVER_PATH}
ExecStartPre=/bin/bash -lc '/usr/bin/screen -S minecraft -X quit || true'
ExecStartPre=/bin/bash -lc 'PIDS=$(sudo ss -ltnp 2>/dev/null | awk "/:25565 / {print \$0}" | sed -n "s/.*pid=\\([0-9]\\+\\).*/\\1/p" | sort -u); [ -n "\\$PIDS" ] && sudo kill -9 \\$PIDS || true'
Environment=JAR_NAME=\${JAR_NAME}
Environment=XMS=1G
Environment=XMX=4G
ExecStart=/usr/bin/screen -S minecraft -d -m /bin/bash ${SERVER_PATH}/start.sh
ExecStop=/usr/bin/screen -p 0 -S minecraft -X eval "stuff \\"stop\\\\015\\""
Restart=on-failure
RestartSec=5
TimeoutStopSec=40
SuccessExitStatus=0 1
KillMode=none

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now minecraft

echo "--- Instalación Finalizada ---"
`;

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });
  execSshCommand(sshData.conn, installScript, res).catch((err) => {
    if (!res.writableEnded) res.end(`\nERROR: ${err.message}`);
  });
});

// ---------- latest.log ----------
app.get('/api/get-latest-log', async (req, res) => {
  const { connectionId } = req.query;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  const command = `
    LOG="${SERVER_PATH_BASE(sshData.sshUser)}/logs/latest.log";
    if [ -f "$LOG" ]; then
      cat "$LOG";
    else
      echo "";
    fi
  `;
  try {
    const { output } = await execSshCommand(sshData.conn, command);
    res.json({ success: true, logContent: output });
  } catch (error) {
    res.status(500).json({ message: `No se pudo leer latest.log: ${error.message}` });
  }
});

// ---------- Abrir UFW ----------
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

  execSshCommand(sshData.conn, script, res).catch((err) => {
    if (!res.writableEnded) res.end(`\nERROR: ${err.message}`);
  });
});

// ---------- Limpieza Profunda ----------
app.post('/api/deep-clean', async (req, res) => {
  const { connectionId } = req.body;
  const sshData = sshConnections.get(connectionId);
  if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

  const script = `
echo "--- Limpieza Profunda ---";
sudo systemctl stop minecraft || echo "Info: Servicio no activo.";
sudo systemctl disable minecraft || echo "Info: Servicio no habilitado.";
sudo rm -f /etc/systemd/system/minecraft.service || true;
sudo systemctl daemon-reload || true;
sudo systemctl reset-failed || true;
rm -rf ${SERVER_PATH_BASE(sshData.sshUser)};
echo "Carpeta del servidor eliminada.";
echo "--- Limpieza Completada ---";
`;

  try {
    const { output } = await execSshCommand(sshData.conn, script);
    res.json({ success: true, output });
  } catch (error) {
    res.status(500).json({ message: `Error en limpieza: ${error.message}` });
  }
});

// ---------- Cierre ordenado ----------
process.on('SIGINT', () => {
  sshConnections.forEach((d) => d.conn.end());
  process.exit();
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
