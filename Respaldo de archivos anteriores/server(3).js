const express = require('express');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { Client } = require('ssh2');

const app = express();
const port = 3000;
const execAsync = promisify(exec);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// Almacenamiento de conexiones SSH activas
const sshConnections = new Map();

// =====================================================
// CONEXIÓN SSH
// =====================================================
app.post('/api/connect', async (req, res) => {
    const { vpsIp, sshUser, sshKey } = req.body;
    
    if (!vpsIp || !sshUser || !sshKey) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros de conexión' });
    }

    const conn = new Client();
    const connectionId = `${vpsIp}_${sshUser}_${Date.now()}`;

    conn.on('ready', () => {
        console.log(`SSH conectado a ${vpsIp} como ${sshUser}`);
        sshConnections.set(connectionId, { conn, vpsIp, sshUser });
        res.json({ success: true, connectionId, message: `Conectado a ${vpsIp}` });
    }).on('error', (err) => {
        console.error('Error SSH:', err);
        res.status(500).json({ success: false, message: 'Error de conexión SSH', error: err.message });
    }).connect({
        host: vpsIp,
        port: 22,
        username: sshUser,
        privateKey: sshKey,
        readyTimeout: 30000
    });
});

// =====================================================
// EJECUTAR COMANDO SSH
// =====================================================
app.post('/api/execute-command', async (req, res) => {
    const { connectionId, command } = req.body;
    const sshData = sshConnections.get(connectionId);
    
    if (!sshData) {
        return res.status(400).json({ success: false, message: 'Conexión SSH no encontrada' });
    }

    sshData.conn.exec(command, (err, stream) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error ejecutando comando', error: err.message });
        }

        let output = '';
        let errorOutput = '';

        stream.on('close', (code) => {
            res.json({ 
                success: code === 0, 
                output, 
                error: errorOutput,
                exitCode: code 
            });
        }).on('data', (data) => {
            output += data.toString();
        }).stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
    });
});

// =====================================================
// VERIFICAR SERVIDOR MINECRAFT
// =====================================================
app.post('/api/check-minecraft-server', async (req, res) => {
    const { connectionId } = req.body;
    const sshData = sshConnections.get(connectionId);
    
    if (!sshData) {
        return res.status(400).json({ success: false, message: 'Conexión SSH no encontrada' });
    }

    const checkCommand = 'ls -la ~/minecraft-server/server.jar 2>/dev/null && echo "EXISTS" || echo "NOT_EXISTS"';
    
    sshData.conn.exec(checkCommand, (err, stream) => {
        if (err) {
            return res.status(500).json({ success: false, exists: false });
        }

        let output = '';
        stream.on('close', () => {
            const exists = output.includes('EXISTS') && !output.includes('NOT_EXISTS');
            res.json({ success: true, exists });
        }).on('data', (data) => {
            output += data.toString();
        });
    });
});

// =====================================================
// INSTALAR SERVIDOR MINECRAFT
// =====================================================
app.post('/api/install-minecraft', async (req, res) => {
    const { connectionId, serverType, version, minRam, maxRam, properties } = req.body;
    const sshData = sshConnections.get(connectionId);
    
    if (!sshData) {
        return res.status(400).json({ success: false, message: 'Conexión SSH no encontrada' });
    }

    // Script de instalación
    const installScript = `
#!/bin/bash
set -e

echo "=== Iniciando instalación de Minecraft Server ==="

# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Java 21 y Screen
sudo apt install -y openjdk-21-jdk screen

# Crear directorio del servidor
mkdir -p ~/minecraft-server
cd ~/minecraft-server

# Descargar servidor Vanilla (se puede expandir para otros tipos)
echo "Descargando Minecraft Vanilla ${version}..."
wget -O server.jar "https://piston-data.mojang.com/v1/objects/145ff0858209bcfc164859ba735d4199aafa1eea/server.jar"

# Aceptar EULA
echo "eula=true" > eula.txt

# Crear archivo de propiedades
cat > server.properties << EOF
${Object.entries(properties || {}).map(([key, value]) => `${key}=${value}`).join('\n')}
EOF

# Crear script de inicio
cat > start.sh << 'EOF'
#!/bin/bash
java -Xms${minRam} -Xmx${maxRam} -jar server.jar nogui
EOF
chmod +x start.sh

# Configurar servicio systemd
sudo tee /etc/systemd/system/minecraft.service > /dev/null << EOF
[Unit]
Description=Minecraft Server
After=network.target

[Service]
Type=simple
User=${sshData.sshUser}
WorkingDirectory=/home/${sshData.sshUser}/minecraft-server
ExecStart=/usr/bin/screen -S minecraft -d -m /home/${sshData.sshUser}/minecraft-server/start.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable minecraft

# Abrir puertos en el firewall local (UFW)
sudo ufw allow 25565/tcp
sudo ufw allow 25565/udp
sudo ufw --force enable

echo "=== Instalación completada ==="
`;

    // Ejecutar script de instalación
    sshData.conn.exec(`echo '${installScript}' | bash`, (err, stream) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error en instalación', error: err.message });
        }

        let output = '';
        let errorOutput = '';

        stream.on('close', (code) => {
            res.json({ 
                success: code === 0, 
                message: code === 0 ? 'Servidor instalado correctamente' : 'Error en la instalación',
                output,
                error: errorOutput
            });
        }).on('data', (data) => {
            output += data.toString();
        }).stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
    });
});


// =====================================================
// CONTROL DEL SERVIDOR (Start/Stop/Restart/Status)
// =====================================================
app.post('/api/server-control', async (req, res) => {
    const { connectionId, action } = req.body;
    const sshData = sshConnections.get(connectionId);
    
    if (!sshData) {
        return res.status(400).json({ success: false, message: 'Conexión SSH no encontrada' });
    }

    const commands = {
        start: 'sudo systemctl start minecraft',
        stop: 'sudo systemctl stop minecraft',
        restart: 'sudo systemctl restart minecraft',
        status: 'sudo systemctl status minecraft'
    };

    const command = commands[action];
    if (!command) {
        return res.status(400).json({ success: false, message: 'Acción no válida' });
    }

    sshData.conn.exec(command, (err, stream) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error ejecutando comando', error: err.message });
        }

        let output = '';
        stream.on('close', (code) => {
            res.json({ 
                success: true,
                action,
                output,
                message: `Comando '${action}' ejecutado.`
            });
        }).on('data', (data) => {
            output += data.toString();
        });
    });
});

// =====================================================
// LOGS EN VIVO
// =====================================================
app.get('/api/live-logs', (req, res) => {
    const { connectionId } = req.query;
    const sshData = sshConnections.get(connectionId);
    
    if (!sshData) {
        return res.status(400).json({ success: false, message: 'Conexión SSH no encontrada' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const command = 'tail -f -n 50 ~/minecraft-server/logs/latest.log';
    sshData.conn.exec(command, (err, stream) => {
        if (err) {
            res.write(`data: Error al iniciar logs: ${err.message}\n\n`);
            return res.end();
        }

        stream.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if(line) res.write(`data: ${line}\n`);
            });
            res.write(`\n`);
        }).on('close', () => {
            res.end();
        });
        
        req.on('close', () => {
            stream.close();
        });
    });
});


// =====================================================
// FIREWALL OCI MEJORADO
// =====================================================
app.post('/api/open-oci-firewall', async (req, res) => {
    const { compartmentId, vcnId } = req.body;
    console.log('Abriendo firewall de OCI para Minecraft...');

    if (!compartmentId) {
        return res.status(400).json({ 
            success: false, 
            message: 'El OCID del Compartimento es obligatorio' 
        });
    }

    try {
        let finalVcnId = vcnId;
        
        if (!finalVcnId) {
            console.log('VCN ID no proporcionado, obteniendo automáticamente...');
            const vcnListCmd = `oci network vcn list --compartment-id "${compartmentId}" --query "data[0].id" --raw-output`;
            const { stdout: foundVcnId, stderr: vcnErr } = await execAsync(vcnListCmd, { timeout: 30000 });

            if (vcnErr || !foundVcnId) {
                 return res.status(404).json({ success: false, message: 'No se encontraron VCNs en el compartimento', error: vcnErr });
            }
            finalVcnId = foundVcnId.trim();
            console.log(`VCN encontrada automáticamente: ${finalVcnId}`);
        }

        const listCommand = `oci network security-list list --compartment-id "${compartmentId}" --vcn-id "${finalVcnId}" --all`;
        const { stdout: listJson } = await execAsync(listCommand, { timeout: 30000 });
        
        // --- INICIO DE LA CORRECCIÓN ---
        // Se añade esta comprobación para manejar el caso en que OCI no devuelve resultados.
        // Si la salida (listJson) está vacía, JSON.parse falla. 
        // Ahora asignamos un array vacío por defecto a 'securityLists'.
        let securityLists = [];
        if (listJson && listJson.trim() !== '') {
            try {
                // Solo se analiza el JSON si hay contenido.
                const parsedResponse = JSON.parse(listJson);
                securityLists = parsedResponse.data || []; // Aseguramos que 'data' exista
            } catch (e) {
                // Si la salida no es un JSON válido, lanzamos un error más descriptivo.
                console.error("Error: La salida de OCI no pudo ser analizada como JSON.", listJson);
                throw new Error("Respuesta inválida desde la CLI de OCI.");
            }
        }
        // --- FIN DE LA CORRECCIÓN ---

        // El resto del código ahora funciona de forma segura con 'securityLists', incluso si está vacío.
        if (securityLists.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontraron listas de seguridad' });
        }
        
        const defaultList = securityLists.find(list => list['display-name'].toLowerCase().includes('default')) || securityLists[0];
        const securityListId = defaultList.id;
        let ingressRules = defaultList['ingress-security-rules'] || [];

        const tcpExists = ingressRules.some(r => r.protocol === '6' && r['tcp-options']?.['destination-port-range']?.min === 25565);
        const udpExists = ingressRules.some(r => r.protocol === '17' && r['udp-options']?.['destination-port-range']?.min === 25565);

        if (tcpExists && udpExists) {
            return res.json({ success: true, message: 'El firewall ya está configurado para Minecraft (puerto 25565)' });
        }

        if (!tcpExists) {
            ingressRules.push({
                "protocol": "6", "source": "0.0.0.0/0", "isStateless": false,
                "tcp-options": { "destination-port-range": { "min": 25565, "max": 25565 }},
                "description": "Minecraft Server TCP"
            });
        }
        if (!udpExists) {
            ingressRules.push({
                "protocol": "17", "source": "0.0.0.0/0", "isStateless": false,
                "udp-options": { "destination-port-range": { "min": 25565, "max": 25565 }},
                "description": "Minecraft Server UDP"
            });
        }

        const tempFile = path.join(os.tmpdir(), `oci-rules-${Date.now()}.json`);
        await fs.writeFile(tempFile, JSON.stringify({ "ingress-security-rules": ingressRules }));
        
        const updateCmd = `oci network security-list update --security-list-id "${securityListId}" --from-json file://${tempFile} --force`;
        await execAsync(updateCmd, { timeout: 30000 });
        
        await fs.unlink(tempFile);

        res.json({ success: true, message: 'Firewall de OCI configurado correctamente para Minecraft (puerto 25565 TCP/UDP)' });

    } catch (error) {
        console.error('Error configurando firewall:', error);
        res.status(500).json({ success: false, message: 'Error al configurar el firewall de OCI', error: error.stderr || error.message });
    }
});


// =====================================================
// DESCONECTAR SSH
// =====================================================
app.post('/api/disconnect', (req, res) => {
    const { connectionId } = req.body;
    const sshData = sshConnections.get(connectionId);
    
    if (sshData) {
        sshData.conn.end();
        sshConnections.delete(connectionId);
    }
    
    res.json({ success: true, message: 'Desconectado' });
});


// Limpiar conexiones al cerrar el servidor
process.on('SIGINT', () => {
    console.log('\nCerrando conexiones SSH...');
    sshConnections.forEach((data) => {
        data.conn.end();
    });
    process.exit();
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});
