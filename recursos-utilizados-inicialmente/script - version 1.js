document.addEventListener('DOMContentLoaded', () => {
    // --- Referencias a elementos del DOM ---
    const connectionForm = document.getElementById('connection-form');
    const vpsIpInput = document.getElementById('vps-ip');
    const sshUserInput = document.getElementById('ssh-user');
    const sshKeyInput = document.getElementById('ssh-key-input');
    const sshKeyStatus = document.getElementById('ssh-key-status');
    const connectionStatus = document.getElementById('connection-status');
    const managementSections = document.getElementById('management-sections');
    const ociConfigSection = document.getElementById('oci-config-section');
    const saveOciButton = document.getElementById('save-oci-button');
    const compartmentIdInput = document.getElementById('oci-compartment-id');
    const vcnIdInput = document.getElementById('oci-vcn-id');
    const openOciFirewallButton = document.getElementById('open-oci-firewall-button');
    const serverConsole = document.getElementById('server-console');

    // --- Estado de la aplicación ---
    let sshKeyContent = null;
    let currentConfig = {};
    let connectionId = null;
    let liveLogsEventSource = null;

    // --- Lógica de la interfaz ---
    loadConfig();
    setupServerControls();
    populateInstallationForm();

    // Conexión SSH real al servidor
    connectionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const vpsIp = vpsIpInput.value;
        const sshUser = sshUserInput.value;

        if (!vpsIp || !sshUser || !sshKeyContent) {
            updateConnectionStatus('Por favor, completa todos los campos y selecciona una llave SSH.', 'error');
            return;
        }

        updateConnectionStatus('Conectando...', 'loading');
        
        try {
            const response = await fetch('/api/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vpsIp, sshUser, sshKey: sshKeyContent })
            });

            const result = await response.json();

            if (result.success) {
                connectionId = result.connectionId;
                currentConfig = { vpsIp, sshUser }; // No guardamos la llave en currentConfig por seguridad
                updateConnectionStatus(`Conectado a ${vpsIp} como ${sshUser}`, 'success');
                showManagementSections();
                saveConfig();
                await checkMinecraftServer();
            } else {
                updateConnectionStatus(`Error: ${result.message}`, 'error');
            }
        } catch (error) {
            updateConnectionStatus('Error de conexión con el servidor local. ¿Está en ejecución?', 'error');
            console.error('Error:', error);
        }
    });
    
    // Cargar archivo de llave SSH
    sshKeyInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                sshKeyContent = event.target.result;
                sshKeyStatus.textContent = `Archivo cargado: ${file.name}`;
                sshKeyStatus.style.color = 'green';
            };
            reader.readAsText(file);
        }
    });

    // Guardar configuración OCI
    saveOciButton.addEventListener('click', () => {
        localStorage.setItem('ociCompartmentId', compartmentIdInput.value.trim());
        localStorage.setItem('ociVcnId', vcnIdInput.value.trim());
        logToConsole('Configuración de OCI guardada localmente.', 'info');
    });

    // Abrir firewall de OCI
    openOciFirewallButton.addEventListener('click', async () => {
        logToConsole('Iniciando proceso para abrir el firewall de OCI...', 'info');
        
        const compartmentId = localStorage.getItem('ociCompartmentId');
        const vcnId = localStorage.getItem('ociVcnId');

        if (!compartmentId) {
            const errorMsg = 'Error: Falta el OCID del Compartimento. Por favor, guárdalo en la sección de configuración.';
            logToConsole(errorMsg, 'error');
            alert(errorMsg);
            return;
        }
        
        const response = await fetch('/api/open-oci-firewall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ compartmentId, vcnId }),
        });
        const result = await response.json();
        logToConsole(result.message, result.success ? 'success' : 'error');
        if (result.error) logToConsole(`Detalle: ${result.error}`, 'error');
    });

    // --- Funciones para controlar el servidor ---
    function setupServerControls() {
        document.getElementById('start-server')?.addEventListener('click', () => serverControl('start'));
        document.getElementById('stop-server')?.addEventListener('click', () => serverControl('stop'));
        document.getElementById('restart-server')?.addEventListener('click', () => serverControl('restart'));
        document.getElementById('check-status')?.addEventListener('click', () => serverControl('status'));
        document.getElementById('live-logs-button')?.addEventListener('click', toggleLiveLogs);
        document.getElementById('execute-custom-command-button')?.addEventListener('click', executeCustomCommand);
        document.getElementById('install-button')?.addEventListener('click', installMinecraftServer);
    }

    async function apiPost(endpoint, body) {
        if (!connectionId) {
            logToConsole('Error: No hay una conexión SSH activa.', 'error');
            return null;
        }
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId, ...body })
            });
            return await response.json();
        } catch (error) {
            logToConsole(`Error de red al llamar a ${endpoint}.`, 'error');
            return null;
        }
    }

    async function serverControl(action) {
        logToConsole(`Ejecutando: ${action} servidor...`, 'info');
        const result = await apiPost('/api/server-control', { action });
        if (result) {
            logToConsole(`--- Salida del comando '${action}' ---`, 'info');
            logToConsole(result.output || result.message, 'info');
            logToConsole(`--- Fin de la salida ---`, 'info');
        }
    }

    async function checkMinecraftServer() {
        logToConsole('Verificando si existe un servidor de Minecraft...', 'info');
        const result = await apiPost('/api/check-minecraft-server', {});
        
        const newServerPanel = document.getElementById('new-server-panel');
        const existingServerPanel = document.getElementById('existing-server-panel');
        
        if (result && result.success) {
            if (result.exists) {
                logToConsole('Servidor Minecraft detectado.', 'success');
                newServerPanel?.classList.add('hidden');
                existingServerPanel?.classList.remove('hidden');
            } else {
                logToConsole('No se detectó un servidor. Mostrando formulario de instalación.', 'info');
                newServerPanel?.classList.remove('hidden');
                existingServerPanel?.classList.add('hidden');
            }
        } else {
            logToConsole('Error verificando el servidor.', 'error');
        }
    }

    async function installMinecraftServer() {
        const formContainer = document.getElementById('installation-form-container');
        const properties = {
            'motd': formContainer.querySelector('#motd')?.value,
            'level-name': formContainer.querySelector('#level-name')?.value,
            'max-players': formContainer.querySelector('#max-players')?.value,
            'view-distance': formContainer.querySelector('#view-distance')?.value,
            'gamemode': formContainer.querySelector('#gamemode')?.value,
            'difficulty': formContainer.querySelector('#difficulty')?.value,
            'pvp': formContainer.querySelector('#pvp')?.value,
            'hardcore': formContainer.querySelector('#hardcore')?.value
        };

        const installData = {
            serverType: formContainer.querySelector('#server-type')?.value,
            version: formContainer.querySelector('#server-version')?.value,
            minRam: formContainer.querySelector('#min-ram')?.value,
            maxRam: formContainer.querySelector('#max-ram')?.value,
            properties,
        };
        
        logToConsole('Iniciando instalación del servidor Minecraft...', 'info');
        logToConsole('Esto puede tomar varios minutos. Por favor, espera...', 'info');
        
        const result = await apiPost('/api/install-minecraft', installData);

        if (result) {
            logToConsole(result.message, result.success ? 'success' : 'error');
            if (result.output) logToConsole("--- Log de Instalación ---\n" + result.output, 'info');
            if (result.error) logToConsole("--- Errores de Instalación ---\n" + result.error, 'error');
            if (result.success) await checkMinecraftServer();
        }
    }
    
    async function executeCommand(command) {
        logToConsole(`> ${command}`, 'info');
        const result = await apiPost('/api/execute-command', { command });
        if (result) {
            const output = result.output || result.error || 'El comando no produjo salida.';
            logToConsole(output, result.success ? 'info' : 'error');
        }
    }

    function executeCustomCommand() {
        const commandInput = document.getElementById('custom-command-input');
        const command = commandInput.value.trim();
        if (command) {
            executeCommand(command);
            commandInput.value = '';
        }
    }
    
    function toggleLiveLogs() {
        const button = document.getElementById('live-logs-button');
        if (liveLogsEventSource) {
            liveLogsEventSource.close();
            liveLogsEventSource = null;
            logToConsole('Logs en vivo detenidos.', 'info');
            button.textContent = 'Logs en Vivo';
            button.classList.remove('danger-button');
        } else {
            if (!connectionId) {
                logToConsole('No hay conexión SSH activa para ver los logs.', 'error');
                return;
            }
            logToConsole('Iniciando logs en vivo...', 'info');
            liveLogsEventSource = new EventSource(`/api/live-logs?connectionId=${connectionId}`);
            
            liveLogsEventSource.onmessage = (event) => {
                serverConsole.value += event.data + '\n';
                serverConsole.scrollTop = serverConsole.scrollHeight;
            };
            
            liveLogsEventSource.onerror = () => {
                logToConsole('Error en la conexión de logs en vivo. Se ha cerrado.', 'error');
                liveLogsEventSource.close();
                liveLogsEventSource = null;
                button.textContent = 'Logs en Vivo';
                button.classList.remove('danger-button');
            };

            button.textContent = 'Detener Logs';
            button.classList.add('danger-button');
        }
    }

    // --- Funciones de Utilidad ---

    function updateConnectionStatus(message, type) {
        connectionStatus.textContent = message;
        connectionStatus.className = type; // 'success', 'error', 'loading'
    }

    function showManagementSections() {
        document.getElementById('connection-section').classList.add('hidden');
        managementSections.classList.remove('hidden');
        ociConfigSection.classList.remove('hidden');
    }

    function logToConsole(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        serverConsole.value += `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
        serverConsole.scrollTop = serverConsole.scrollHeight;
    }

    function saveConfig() {
        // Guardamos solo la configuración no sensible
        localStorage.setItem('connectionConfig', JSON.stringify({
            vpsIp: vpsIpInput.value,
            sshUser: sshUserInput.value
        }));
    }
    
    function loadConfig() {
        const savedConfig = localStorage.getItem('connectionConfig');
        if (savedConfig) {
            currentConfig = JSON.parse(savedConfig);
            vpsIpInput.value = currentConfig.vpsIp || '';
            sshUserInput.value = currentConfig.sshUser || '';
        }
        compartmentIdInput.value = localStorage.getItem('ociCompartmentId') || '';
        vcnIdInput.value = localStorage.getItem('ociVcnId') || '';
    }
    
    function populateInstallationForm() {
        const container = document.getElementById('installation-form-container');
        const template = document.getElementById('server-form-template');
        if (container && template) {
            container.innerHTML = '';
            const clone = template.content.cloneNode(true);
            container.appendChild(clone);
        }
    }
});