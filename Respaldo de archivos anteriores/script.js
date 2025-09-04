document.addEventListener('DOMContentLoaded', () => {
    const state = {
        connectionId: null,
        eventSource: null,
        sshKeyContent: null,
        lastStatusOutput: '',
    };

    // --- Selectores de Elementos ---
    const loginView = document.getElementById('login-view');
    const mainView = document.getElementById('main-view');
    const modal = document.getElementById('modal');
    const installerModal = document.getElementById('installer-modal');
    const connectBtn = document.getElementById('connect-btn');
    const vpsIpInput = document.getElementById('vps-ip');
    const sshUserInput = document.getElementById('ssh-user');
    const sshKeyUploadBtn = document.getElementById('ssh-key-upload-btn');
    const sshKeyInput = document.getElementById('ssh-key-input');
    const sshKeyFileName = document.getElementById('ssh-key-file-name');
    const loginError = document.getElementById('login-error');
    const importBtn = document.getElementById('import-config-btn');
    const fileInput = document.getElementById('config-file-input');
    const guideBtns = document.querySelectorAll('.guide-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const exportBtn = document.getElementById('export-config-btn');
    const serverControlBtns = document.querySelectorAll('.server-control-btn');
    const openFirewallBtn = document.getElementById('open-firewall-btn');
    const compartmentIdInput = document.getElementById('compartment-id');
    const logConsole = document.getElementById('log-console');
    const notificationArea = document.getElementById('server-status-notification');
    const deepCleanBtn = document.getElementById('deep-clean-btn');
    const openInstallerBtn = document.getElementById('open-installer-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const installerCloseBtn = document.getElementById('installer-close-btn');
    const serverTypeSelect = document.getElementById('server-type');
    const minecraftVersionSelect = document.getElementById('minecraft-version');
    const installerOutput = document.getElementById('installer-output');
    const installServerBtn = document.getElementById('install-server-btn');
    const commandInput = document.getElementById('command-input');
    const sendCommandBtn = document.getElementById('send-command-btn');
    const commandPresetBtns = document.querySelectorAll('.command-preset-btn');

    // --- Lógica de Modales ---
    const showModal = (title, content, footerContent = '') => {
        modalTitle.textContent = title;
        modalBody.innerHTML = `<div class="prose prose-invert max-w-none text-gray-300">${content}</div>`;
        modalFooter.innerHTML = footerContent;
        modalFooter.classList.toggle('hidden', !footerContent);
        modal.classList.remove('hidden');
    };
    const hideModal = () => modal.classList.add('hidden');
    modalCloseBtn.addEventListener('click', hideModal);
    modal.addEventListener('click', (e) => e.target === modal && hideModal());
    const showInstallerModal = () => installerModal.classList.remove('hidden');
    const hideInstallerModal = () => installerModal.classList.add('hidden');
    openInstallerBtn.addEventListener('click', () => { populateVersionDropdowns(); showInstallerModal(); });
    installerCloseBtn.addEventListener('click', hideInstallerModal);

    // --- Lógica de API ---
    async function apiCall(endpoint, body, method = 'POST') {
        try {
            const options = { method, headers: { 'Content-Type': 'application/json' }};
            if (method !== 'GET') options.body = JSON.stringify(body);
            const response = await fetch(`http://localhost:3000${endpoint}`, options);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Error en el servidor');
            return data;
        } catch (error) { console.error(`Error en ${endpoint}:`, error); throw error; }
    }

    // --- Lógica de Conexión y Sesión ---
    async function connectToServer() {
        const vpsIp = vpsIpInput.value.trim(); const sshUser = sshUserInput.value.trim();
        if (!vpsIp || !sshUser || !state.sshKeyContent) { loginError.textContent = 'IP, Usuario y Llave SSH son obligatorios.'; return; }
        loginError.textContent = ''; connectBtn.disabled = true; connectBtn.textContent = 'Conectando...';
        try {
            const data = await apiCall('/api/connect', { vpsIp, sshUser, sshKey: state.sshKeyContent });
            state.connectionId = data.connectionId; loginView.classList.add('hidden'); mainView.classList.remove('hidden');
            await checkServerStatus(); startLiveLogs();
        } catch (error) { loginError.textContent = `Error: ${error.message}`;
        } finally { connectBtn.disabled = false; connectBtn.textContent = 'Conectar'; }
    }
    connectBtn.addEventListener('click', connectToServer);
    disconnectBtn.addEventListener('click', () => {
        if (state.connectionId) apiCall('/api/disconnect', { connectionId: state.connectionId });
        stopLiveLogs(); state.connectionId = null; state.sshKeyContent = null;
        sshKeyFileName.textContent = ''; logConsole.innerHTML = ''; notificationArea.innerHTML = '';
        mainView.classList.add('hidden'); loginView.classList.remove('hidden');
    });
    sshKeyUploadBtn.addEventListener('click', () => sshKeyInput.click());
    sshKeyInput.addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => { state.sshKeyContent = e.target.result; sshKeyFileName.textContent = `Archivo: ${file.name}`; loginError.textContent = ''; };
        reader.readAsText(file);
    });
    exportBtn.addEventListener('click', () => { /* sin cambios */ });
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (event) => { /* sin cambios */ });
    guideBtns.forEach(btn => btn.addEventListener('click', async () => { /* sin cambios */ }));

    // --- Lógica Principal de Gestión ---
    async function checkServerStatus() {
        if (!state.connectionId) return;
        notificationArea.textContent = 'Comprobando estado del servidor...';
        notificationArea.className = 'mb-6 p-4 rounded-lg bg-gray-700';
        try {
            const data = await apiCall('/api/server-status', { connectionId: state.connectionId });
            notificationArea.innerHTML = data.isActive ? `✅ <span class="font-bold">¡Servidor activo!</span> IP: <code class="bg-gray-900 px-2 py-1 rounded">${vpsIpInput.value}:25565</code>` : 'ℹ️ Servidor detenido o no instalado.';
            notificationArea.className = `mb-6 p-4 rounded-lg ${data.isActive ? 'bg-green-600' : 'bg-blue-600'}`;
        } catch(error) {
            notificationArea.textContent = `❌ Error al comprobar estado: ${error.message}`;
            notificationArea.className = 'mb-6 p-4 rounded-lg bg-red-600';
        }
    }

    // ✨ CORREGIDO: Lógica de botones de control con feedback mejorado
    serverControlBtns.forEach(btn => btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        showModal(`Ejecutando: ${action}`, `<p>Enviando comando al servidor... Por favor, espera.</p>`);
        
        try {
            // Ejecutar la acción principal (start, stop, etc.)
            await apiCall('/api/server-control', { connectionId: state.connectionId, action });

            let finalTitle = `Resultado de '${action}'`;
            let resultOutput = '';
            
            // Para acciones que cambian el estado, siempre hacemos un seguimiento con 'status' para ver el resultado real.
            if (['start', 'stop', 'restart'].includes(action)) {
                finalTitle = `Resultado final de '${action}'`;
                // Damos 2 segundos para que systemd procese el comando
                await new Promise(resolve => setTimeout(resolve, 2000));
                const statusData = await apiCall('/api/server-control', { connectionId: state.connectionId, action: 'status' });
                resultOutput = statusData.output;
            } else if (action === 'status') {
                const statusData = await apiCall('/api/server-control', { connectionId: state.connectionId, action: 'status' });
                resultOutput = statusData.output;
            }

            state.lastStatusOutput = resultOutput; // Guardamos para exportar
            const outputHtml = resultOutput.replace(/\n/g, '<br>');
            const footer = `<button id="export-session-log" class="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg text-sm">Exportar este Log</button>`;
            
            showModal(finalTitle, `<pre class="bg-black p-2 rounded text-sm whitespace-pre-wrap">${outputHtml}</pre>`, footer);
            document.getElementById('export-session-log').addEventListener('click', exportSessionLog);

            // Actualizar la notificación principal
            checkServerStatus();
            // Reiniciar los logs en vivo si la acción fue start o restart
            if (['start', 'restart'].includes(action)) {
                startLiveLogs();
            }

        } catch (error) { 
            showModal(`Error al ejecutar '${action}'`, `<p class="text-red-400">${error.message}</p>`);
        }
    }));

    deepCleanBtn.addEventListener('click', async () => {
        if (confirm('¿ESTÁS SEGURO? Esta acción es irreversible y eliminará todos los archivos del servidor de Minecraft y el servicio del sistema.')) {
            showModal('Limpieza Profunda', '<p>Ejecutando script de limpieza en el servidor...</p>');
            try {
                const data = await apiCall('/api/deep-clean', { connectionId: state.connectionId });
                showModal('Limpieza Completada', `<pre>${data.output}</pre>`);
                await checkServerStatus();
            } catch (error) {
                showModal('Error en la Limpieza', `<p class="text-red-400">${error.message}</p>`);
            }
        }
    });

    function downloadFile(filename, content) { /* sin cambios */ }
    function exportSessionLog() { downloadFile(`status-log-${new Date().toISOString()}.txt`, state.lastStatusOutput); }
    async function exportLatestLog() { /* sin cambios */ }
    
    // El resto de funciones (sendCommand, logs en vivo, instalador, etc.) no requieren cambios.
    // ...
    function startLiveLogs() {
        stopLiveLogs();
        logConsole.innerHTML = '<p class="text-yellow-400">Conectando a logs en vivo...</p>';
        const url = `http://localhost:3000/api/live-logs?connectionId=${state.connectionId}`;
        state.eventSource = new EventSource(url);
        let firstMessage = true;
        state.eventSource.onopen = () => {
            if (firstMessage) logConsole.innerHTML = '<p class="text-yellow-400">Conexión a logs establecida. Esperando datos...</p>';
        };
        state.eventSource.onmessage = (event) => {
            if (firstMessage) { logConsole.innerHTML = ''; firstMessage = false; }
            const p = document.createElement('p'); p.textContent = event.data;
            logConsole.appendChild(p); logConsole.scrollTop = logConsole.scrollHeight;
        };
        state.eventSource.onerror = () => {
            if (!firstMessage) logConsole.innerHTML += '<p class="text-red-500 mt-4">Conexión a logs perdida.</p>';
            stopLiveLogs();
        };
    }
    function stopLiveLogs() { if (state.eventSource) { state.eventSource.close(); state.eventSource = null; } }
    async function populateVersionDropdowns() { /* sin cambios */ }
});