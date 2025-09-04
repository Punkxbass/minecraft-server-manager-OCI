const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { Client } = require('ssh2');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const marked = require('marked');

const app = express();
const port = 3000;
const execAsync = promisify(exec);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

const sshConnections = new Map();

// --- ENDPOINT PARA GUÍAS (Sin cambios) ---
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


// --- ENDPOINTS DE INSTALACIÓN (Sin cambios) ---
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
        console.error("Error obteniendo versiones:", error);
        res.status(500).json({ message: `No se pudieron obtener las versiones: ${error.message}` });
    }
});

app.post('/api/install-server', (req, res) => {
    const { connectionId, serverType, mcVersion, properties } = req.body;
    const sshData = sshConnections.get(connectionId);
    if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });

    const propertiesString = Object.entries(properties)
        .map(([key, value]) => `${key.replace(/-/g, '.')}=${value}`)
        .join('\\n');

    const installScript = `
#!/bin/bash
set -e
exec > >(tee /dev/tty) 2>&1

echo "--- Iniciando Instalación (Tipo: ${serverType}, Versión: ${mcVersion}) ---"
echo "Paso 1: Limpiando instalación anterior..."
sudo systemctl stop minecraft &>/dev/null || echo "Info: Servicio no activo."
sudo systemctl disable minecraft &>/dev/null || echo "Info: Servicio no habilitado."
sudo rm -f /etc/systemd/system/minecraft.service
sudo systemctl daemon-reload
sudo systemctl reset-failed
rm -rf /home/${sshData.sshUser}/minecraft-server
mkdir -p /home/${sshData.sshUser}/minecraft-server
cd /home/${sshData.sshUser}/minecraft-server
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
JAR_NAME="server.jar"
if [ "${serverType}" == "vanilla" ]; then
    MANIFEST_URL=$(curl -s https://piston-meta.mojang.com/mc/game/version_manifest_v2.json | jq -r ".versions[] | select(.id == \\"${mcVersion}\\") | .url")
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
cat > start.sh << EOF
#!/bin/bash
java -Xms4G -Xmx20G -jar \${JAR_NAME} nogui
EOF
chmod +x start.sh

echo "Paso 6: Creando servicio de systemd con screen..."
sudo tee /etc/systemd/system/minecraft.service > /dev/null << EOF
[Unit]
Description=Minecraft Server (${serverType} ${mcVersion})
After=network.target
[Service]
User=${sshData.sshUser}
Nice=1
KillMode=none
SuccessExitStatus=0 1
WorkingDirectory=/home/${sshData.sshUser}/minecraft-server
ExecStart=/usr/bin/screen -S minecraft -d -m /bin/bash /home/${sshData.sshUser}/minecraft-server/start.sh
ExecStop=/usr/bin/screen -p 0 -S minecraft -X eval "stuff \\"stop\\\\015\\""
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable minecraft
echo "Servicio creado y habilitado."
echo "--- Instalación Finalizada ---"
`;

    sshData.conn.exec(installScript, (err, stream) => {
        if (err) { res.end(`\nERROR al iniciar el script: ${err.message}`); return; }
        stream.on('data', data => res.write(data))
              .stderr.on('data', data => res.write(data))
              .on('close', () => res.end());
    });
});


// --- ENDPOINTS DE GESTIÓN ---
function execSshCommand(connection, command) {
    return new Promise((resolve, reject) => {
        let output = '', errorOutput = '';
        connection.exec(command, (err, stream) => {
            if (err) return reject(err);
            stream.on('close', (code) => {
                if (code !== 0) {
                    // Para 'start', 'stop', 'restart', 'status', no queremos que falle la promesa.
                    // Queremos devolver el texto del error para que el usuario lo vea.
                    // El comando falló, pero la ejecución SSH fue "exitosa".
                    resolve({ code, output: output || errorOutput, error: errorOutput });
                } else {
                    resolve({ code, output, error: errorOutput });
                }
            }).on('data', data => output += data.toString()).stderr.on('data', data => errorOutput += data.toString());
        });
    });
}

app.post('/api/connect', (req, res) => {
    const { vpsIp, sshUser, sshKey } = req.body;
    if (!vpsIp || !sshUser || !sshKey) return res.status(400).json({ message: 'Faltan parámetros de conexión.' });
    const conn = new Client();
    const connectionId = `${vpsIp}_${Date.now()}`;
    conn.on('ready', () => {
        sshConnections.set(connectionId, { conn, sshUser, vpsIp });
        res.json({ success: true, connectionId });
    }).on('error', (err) => res.status(500).json({ message: 'Error de conexión SSH: ' + err.message }))
      .on('end', () => sshConnections.delete(connectionId))
      .connect({ host: vpsIp, port: 22, username: sshUser, privateKey: sshKey, readyTimeout: 20000 });
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

app.post('/api/server-control', async (req, res) => {
    const { connectionId, action } = req.body;
    const sshData = sshConnections.get(connectionId);
    if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });

    // ✨ CORRECCIÓN: Se añade 'rm -f' al archivo de bloqueo antes de iniciar/reiniciar
    const lockFilePath = `/home/${sshData.sshUser}/minecraft-server/world/session.lock`;
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
    } catch(err) { 
        res.status(500).json({ message: err.message }); 
    }
});

app.post('/api/send-command', async (req, res) => {
    const { connectionId, command } = req.body;
    const sshData = sshConnections.get(connectionId);
    if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
    if (!command) return res.status(400).json({ message: 'El comando no puede estar vacío.' });
    
    const escapedCommand = command.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const screenCommand = `/usr/bin/screen -p 0 -S minecraft -X eval "stuff \\"${escapedCommand}\\\\015\\""`;
    
    try {
        await execSshCommand(sshData.conn, screenCommand);
        res.json({ success: true, message: `Comando '${command}' enviado.` });
    } catch(err) { 
        res.status(500).json({ message: `Error al enviar comando. ¿Está el servidor activo? Detalles: ${err.message}` }); 
    }
});

app.get('/api/get-latest-log', async (req, res) => {
    const { connectionId } = req.query;
    const sshData = sshConnections.get(connectionId);
    if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
    const logPath = `/home/${sshData.sshUser}/minecraft-server/logs/latest.log`;
    try {
        const { output } = await execSshCommand(sshData.conn, `cat ${logPath}`);
        res.json({ success: true, logContent: output });
    } catch (error) {
        res.status(500).json({ message: `No se pudo leer el log: ${error.message}` });
    }
});

app.post('/api/server-status', async (req, res) => {
    const { connectionId } = req.body;
    const sshData = sshConnections.get(connectionId);
    if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
    try {
        const { output } = await execSshCommand(sshData.conn, 'systemctl is-active --quiet minecraft && echo "ACTIVE" || echo "INACTIVE"');
        res.json({ success: true, isActive: output.trim() === 'ACTIVE' });
    } catch (error) { res.status(200).json({ success: true, isActive: false }); }
});

app.get('/api/live-logs', (req, res) => {
    const { connectionId } = req.query;
    const sshData = sshConnections.get(connectionId);
    if (!sshData) return res.status(400).end('Conexión no encontrada.');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const command = `tail -F -n 50 /home/${sshData.sshUser}/minecraft-server/logs/latest.log`;
    sshData.conn.exec(command, (err, stream) => {
        if (err) {
            res.write(`data: [ERROR] No se pudo acceder al archivo de logs. Puede que el servidor no se haya iniciado correctamente.\n\n`);
            res.end();
            return;
        }
        stream.on('data', data => data.toString().split('\n').forEach(line => line.trim() && res.write(`data: ${line}\n\n`))).on('close', () => res.end()).stderr.on('data', data => res.write(`data: [ERROR LOGS]: ${data.toString().trim()}\n\n`));
        req.on('close', () => stream.close());
    });
});

app.post('/api/deep-clean', async (req, res) => {
    const { connectionId } = req.body;
    const sshData = sshConnections.get(connectionId);
    if (!sshData) return res.status(400).json({ message: 'Conexión no encontrada.' });
    const cleanScript = `echo "--- Limpieza Profunda ---"; sudo systemctl stop minecraft || echo "Info: Servicio no activo."; sudo systemctl disable minecraft || echo "Info: Servicio no habilitado."; sudo rm -f /etc/systemd/system/minecraft.service; sudo systemctl daemon-reload; sudo systemctl reset-failed; echo "Servicio systemd eliminado."; rm -rf /home/${sshData.sshUser}/minecraft-server; echo "Carpeta del servidor eliminada."; echo "--- Limpieza Completada ---";`;
    try {
        const { output, error } = await execSshCommand(sshData.conn, cleanScript);
        res.json({ success: true, output: output || error });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/open-oci-firewall', async (req, res) => {
    // ... (sin cambios en esta función)
});

process.on('SIGINT', () => {
    sshConnections.forEach(data => data.conn.end());
    process.exit();
});

app.listen(port, () => console.log(`Servidor escuchando en http://localhost:${port}`));