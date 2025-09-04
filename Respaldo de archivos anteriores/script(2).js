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
    const toggleVcnInput = document.getElementById('toggle-vcn-input');
    const vcnManualEntry = document.getElementById('vcn-manual-entry');
    const openOciFirewallButton = document.getElementById('open-oci-firewall-button');
    const serverConsole = document.getElementById('server-console');

    // --- Estado de la aplicación ---
    let sshKeyContent = null;
    let currentConfig = {};

    // --- Lógica de la interfaz ---

    // Cargar configuración al inicio
    loadConfig();

    // Manejador del formulario de conexión
    connectionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const vpsIp = vpsIpInput.value;
        const sshUser = sshUserInput.value;

        if (!vpsIp || !sshUser || !sshKeyContent) {
            updateConnectionStatus('Por favor, completa todos los campos y selecciona una llave SSH.', 'error');
            return;
        }

        updateConnectionStatus('Conectando...', 'loading');
        
        currentConfig = { vpsIp, sshUser, sshKey: sshKeyContent };

        // Aquí iría la lógica para establecer la conexión SSH real.
        // Por ahora, simulamos una conexión exitosa para mostrar la interfaz.
        setTimeout(() => {
            updateConnectionStatus(`Conectado a ${vpsIp} como ${sshUser}`, 'success');
            showManagementSections();
            saveConfig();
        }, 1000);
    });
    
    // Manejador para el input de la llave SSH
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

    // Manejador para guardar configuración OCI
    saveOciButton.addEventListener('click', () => {
        const compartmentId = compartmentIdInput.value.trim();
        const vcnId = vcnIdInput.value.trim();

        if (compartmentId) {
            localStorage.setItem('ociCompartmentId', compartmentId);
            if (vcnId) {
                localStorage.setItem('ociVcnId', vcnId);
            } else {
                 localStorage.removeItem('ociVcnId'); // Limpiar si está vacío
            }
            logToConsole('Configuración de OCI guardada localmente.', 'success');
        } else {
            logToConsole('Por favor, introduce al menos el OCID del Compartimento.', 'error');
        }
    });

    // Manejador para mostrar/ocultar VCN manual
    toggleVcnInput.addEventListener('click', (e) => {
        e.preventDefault();
        vcnManualEntry.classList.toggle('hidden');
    });

    // Manejador para el botón de abrir firewall
    openOciFirewallButton.addEventListener('click', async () => {
        logToConsole('Iniciando proceso para abrir el firewall de OCI...', 'info');
        
        // Leer la configuración guardada desde el almacenamiento local
        const compartmentId = localStorage.getItem('ociCompartmentId');
        const vcnId = localStorage.getItem('ociVcnId');

        if (!compartmentId || !vcnId) {
            logToConsole('Error: Falta el OCID del Compartimento o de la VCN. Por favor, guárdalos en la sección de configuración de Oracle Cloud.', 'error');
            alert('Configuración de OCI incompleta. Por favor, introduce y guarda el OCID del Compartimento y de la VCN.');
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/open-oci-firewall', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ compartmentId, vcnId }),
            });

            const result = await response.json();

            if (result.success) {
                logToConsole(`Éxito: ${result.message}`, 'success');
            } else {
                logToConsole(`Error al abrir el firewall: ${result.message}`, 'error');
                if(result.error) {
                     logToConsole(`Detalle del error de OCI: ${result.error}`, 'error');
                }
            }
        } catch (error) {
            logToConsole('Error de conexión con el servidor local. Asegúrate de que está en ejecución.', 'error');
            console.error('Error en la solicitud fetch:', error);
        }
    });

    // --- Funciones de Utilidad ---

    function updateConnectionStatus(message, type) {
        connectionStatus.textContent = message;
        connectionStatus.className = type; // 'success', 'error', 'loading'
    }

    function showManagementSections() {
        managementSections.classList.remove('hidden');
        ociConfigSection.classList.remove('hidden');
    }

    // ******* FUNCIÓN CORREGIDA *******
    function logToConsole(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
        const logMessage = `${prefix} ${message}\n`;

        // Añade el nuevo mensaje al contenido existente del textarea
        serverConsole.value += logMessage;
        
        // Hace auto-scroll hacia el final para ver siempre el último mensaje
        serverConsole.scrollTop = serverConsole.scrollHeight;
    }

    function saveConfig() {
        localStorage.setItem('connectionConfig', JSON.stringify(currentConfig));
        localStorage.setItem('ociCompartmentId', compartmentIdInput.value);
        localStorage.setItem('ociVcnId', vcnIdInput.value);
    }
    
    function loadConfig() {
        const savedConfig = localStorage.getItem('connectionConfig');
        const savedCompartmentId = localStorage.getItem('ociCompartmentId');
        const savedVcnId = localStorage.getItem('ociVcnId');

        if (savedConfig) {
            currentConfig = JSON.parse(savedConfig);
            vpsIpInput.value = currentConfig.vpsIp || '';
            sshUserInput.value = currentConfig.sshUser || '';
            if (currentConfig.sshKey) {
                sshKeyContent = currentConfig.sshKey;
                sshKeyStatus.textContent = 'Llave SSH cargada desde la configuración guardada.';
                sshKeyStatus.style.color = 'blue';
            }
        }
        if(savedCompartmentId) {
            compartmentIdInput.value = savedCompartmentId;
        }
        if(savedVcnId) {
            vcnIdInput.value = savedVcnId;
        }
    }
});