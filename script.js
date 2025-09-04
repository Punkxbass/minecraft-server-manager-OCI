document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = '';
    const state = {
        connectionId: null,
        eventSource: null,
        sshKeyContent: null,
        lastStatusOutput: '',
        resourceMonitorInterval: null,
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
    const cpuUsageEl = document.getElementById('cpu-usage');
    const ramUsageEl = document.getElementById('ram-usage');
    const diskUsageEl = document.getElementById('disk-usage');
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
    const editPropertiesBtn = document.getElementById('edit-properties-btn');
    const propertiesModal = document.getElementById('properties-modal');
    const propertiesCloseBtn = document.getElementById('properties-close-btn');
    const propertiesBody = document.getElementById('properties-body');
    const savePropertiesBtn = document.getElementById('save-properties-btn');
    const managePlayersBtn = document.getElementById('manage-players-btn');
    const playersModal = document.getElementById('players-modal');
    const playersCloseBtn = document.getElementById('players-close-btn');
    const opsList = document.getElementById('ops-list');
    const whitelistList = document.getElementById('whitelist-list');
    const addOpBtn = document.getElementById('add-op-btn');
    const addWhitelistBtn = document.getElementById('add-whitelist-btn');
    const manageBackupsBtn = document.getElementById('manage-backups-btn');
    const backupsModal = document.getElementById('backups-modal');
    const backupsCloseBtn = document.getElementById('backups-close-btn');
    const createBackupBtn = document.getElementById('create-backup-btn');
    const backupOutput = document.getElementById('backup-output');
    const backupsList = document.getElementById('backups-list');
    const exportLatestLogBtn = document.getElementById('export-latest-log-btn');

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
    installServerBtn.addEventListener('click', async () => {
        const serverType = serverTypeSelect.value;
        const mcVersion = minecraftVersionSelect.value;
        if (!serverType || !mcVersion) { installerOutput.textContent = 'Debe seleccionar tipo y versión.'; return; }
        installerOutput.textContent = ''; installServerBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/api/install-server`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: state.connectionId, serverType, mcVersion, properties: {} })
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            while (!done) {
                const { value, done: finished } = await reader.read();
                if (value) installerOutput.textContent += decoder.decode(value);
                done = finished;
            }
        } catch (error) {
            installerOutput.textContent += `\nERROR: ${error.message}`;
        } finally { installServerBtn.disabled = false; }
    });

    // --- Lógica de API ---
    async function apiCall(endpoint, body, method = 'POST') {
        try {
            const options = { method, headers: { 'Content-Type': 'application/json' }};
            if (method !== 'GET') options.body = JSON.stringify(body);
            const response = await fetch(`${API_BASE}${endpoint}`, options);
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
            await checkServerStatus(); startLiveLogs(); startResourceMonitor();
        } catch (error) { loginError.textContent = `Error: ${error.message}`;
        } finally { connectBtn.disabled = false; connectBtn.textContent = 'Conectar'; }
    }
    connectBtn.addEventListener('click', connectToServer);
    disconnectBtn.addEventListener('click', () => {
        if (state.connectionId) apiCall('/api/disconnect', { connectionId: state.connectionId });
        stopLiveLogs(); stopResourceMonitor(); state.connectionId = null; state.sshKeyContent = null;
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
    exportBtn.addEventListener('click', () => {
        const cfg = { vpsIp: vpsIpInput.value.trim(), sshUser: sshUserInput.value.trim(), sshKey: state.sshKeyContent };
        downloadFile('connection-config.json', JSON.stringify(cfg, null, 2));
    });
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const cfg = JSON.parse(e.target.result);
                vpsIpInput.value = cfg.vpsIp || '';
                sshUserInput.value = cfg.sshUser || '';
                if (cfg.sshKey) { state.sshKeyContent = cfg.sshKey; sshKeyFileName.textContent = 'Llave importada'; }
            } catch { alert('Archivo de configuración inválido'); }
        };
        reader.readAsText(file);
    });
    guideBtns.forEach(btn => btn.addEventListener('click', async () => {
        const file = btn.dataset.file;
        try {
            const data = await apiCall(`/api/get-guide?file=${encodeURIComponent(file)}`, {}, 'GET');
            showModal(btn.textContent, data.content);
        } catch (error) {
            showModal('Error', `<p class="text-red-400">${error.message}</p>`);
        }
    }));

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

    function startResourceMonitor() {
        stopResourceMonitor();
        state.resourceMonitorInterval = setInterval(async () => {
            try {
                const data = await apiCall(`/api/get-resources?connectionId=${state.connectionId}`, {}, 'GET');
                const stats = data.data || {};
                cpuUsageEl.textContent = stats.CPU_USAGE ? `${stats.CPU_USAGE}%` : 'N/A';
                ramUsageEl.textContent = stats.RAM_DATA || 'N/A';
                diskUsageEl.textContent = stats.DISK_DATA || 'N/A';
            } catch (err) {
                console.error('Resource monitor error', err);
            }
        }, 5000);
    }
    function stopResourceMonitor() {
        if (state.resourceMonitorInterval) {
            clearInterval(state.resourceMonitorInterval);
            state.resourceMonitorInterval = null;
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

    function downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: filename });
        document.body.appendChild(a); a.click();
        URL.revokeObjectURL(url); a.remove();
    }
    function exportSessionLog() { downloadFile(`status-log-${new Date().toISOString()}.txt`, state.lastStatusOutput); }
    async function exportLatestLog() {
        if (!state.connectionId) return;
        try {
            const res = await fetch(`${API_BASE}/api/get-latest-log?connectionId=${state.connectionId}`);
            const text = await res.text();
            downloadFile('latest.log', text);
        } catch (error) { showModal('Error', `<p class="text-red-400">${error.message}</p>`); }
    }
    
    exportLatestLogBtn.addEventListener('click', exportLatestLog);
    commandPresetBtns.forEach(btn => btn.addEventListener('click', () => sendCommand(btn.dataset.command)));
    sendCommandBtn.addEventListener('click', () => sendCommand(commandInput.value.trim()));
    commandInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendCommand(commandInput.value.trim()); });
    function sendCommand(command) {
        if (!command) return;
        commandInput.value = '';
        apiCall('/api/send-command', { connectionId: state.connectionId, command }).catch(err => {
            showModal('Error', `<p class=\"text-red-400\">${err.message}</p>`);
        });
    }

    // --- Logs en vivo ---
    function startLiveLogs() {
        stopLiveLogs();
        logConsole.innerHTML = '<p class="text-yellow-400">Conectando a logs en vivo...</p>';
        const url = `${API_BASE}/api/live-logs?connectionId=${state.connectionId}`;
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
    async function populateVersionDropdowns() {
        const type = serverTypeSelect.value;
        minecraftVersionSelect.innerHTML = '<option value="">Cargando...</option>';
        try {
            const data = await apiCall(`/api/minecraft-versions?type=${type}`, {}, 'GET');
            minecraftVersionSelect.innerHTML = data.versions.map(v => `<option value="${v}">${v}</option>`).join('');
        } catch { minecraftVersionSelect.innerHTML = '<option value="">Error</option>'; }
    }

    openFirewallBtn.addEventListener('click', async () => {
        const compartmentId = compartmentIdInput.value.trim();
        if (!compartmentId) { showModal('Firewall', '<p class="text-red-400">Debes proporcionar el OCID del compartimento.</p>'); return; }
        showModal('Abriendo puertos', '<p>Configurando firewall en OCI y VPS...</p>');
        try {
            const oci = await apiCall('/api/open-oci-firewall', { compartmentId });
            let message = `<p>${oci.message}</p>`;
            if (state.connectionId) {
                const res = await fetch(`${API_BASE}/api/open-ufw`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ connectionId: state.connectionId }) });
                const text = await res.text();
                message += `<pre class="bg-black p-2 rounded mt-2 whitespace-pre-wrap">${text}</pre>`;
            }
            showModal('Firewall', message);
        } catch (error) {
            showModal('Error', `<p class="text-red-400">${error.message}</p>`);
        }
    });

    // --- Gestión de jugadores ---
    managePlayersBtn.addEventListener('click', loadPlayersModal);
    playersCloseBtn.addEventListener('click', () => playersModal.classList.add('hidden'));
    async function loadPlayersModal() {
        playersModal.classList.remove('hidden');
        opsList.innerHTML = '<p>Cargando...</p>';
        whitelistList.innerHTML = '<p>Cargando...</p>';
        try {
            const data = await apiCall(`/api/get-players?connectionId=${state.connectionId}`, {}, 'GET');
            renderPlayerLists(data.ops || [], data.whitelist || []);
        } catch (error) {
            opsList.innerHTML = `<p class="text-red-400">${error.message}</p>`;
            whitelistList.innerHTML = '';
        }
    }
    function renderPlayerLists(ops, whitelist) {
        opsList.innerHTML = '';
        ops.forEach(op => {
            const name = op.name || op;
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center mb-1';
            li.innerHTML = `<span>${name}</span><button data-username="${name}" data-list="ops" class="remove-player text-red-500 text-sm">Eliminar</button>`;
            opsList.appendChild(li);
        });
        whitelistList.innerHTML = '';
        whitelist.forEach(w => {
            const name = w.name || w;
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center mb-1';
            li.innerHTML = `<span>${name}</span><button data-username="${name}" data-list="whitelist" class="remove-player text-red-500 text-sm">Eliminar</button>`;
            whitelistList.appendChild(li);
        });
        playersModal.querySelectorAll('.remove-player').forEach(btn => btn.addEventListener('click', async () => {
            const username = btn.dataset.username;
            const list = btn.dataset.list;
            try { await apiCall('/api/manage-player', { connectionId: state.connectionId, list, action: 'remove', username }); loadPlayersModal(); }
            catch (err) { alert(err.message); }
        }));
    }
    addOpBtn.addEventListener('click', async () => {
        const username = prompt('Nombre del jugador a agregar como OP:');
        if (!username) return;
        try { await apiCall('/api/manage-player', { connectionId: state.connectionId, list: 'ops', action: 'add', username }); loadPlayersModal(); }
        catch (err) { alert(err.message); }
    });
    addWhitelistBtn.addEventListener('click', async () => {
        const username = prompt('Nombre del jugador a agregar a la whitelist:');
        if (!username) return;
        try { await apiCall('/api/manage-player', { connectionId: state.connectionId, list: 'whitelist', action: 'add', username }); loadPlayersModal(); }
        catch (err) { alert(err.message); }
    });

    // --- Copias de seguridad ---
    manageBackupsBtn.addEventListener('click', openBackupsModal);
    backupsCloseBtn.addEventListener('click', () => backupsModal.classList.add('hidden'));
    createBackupBtn.addEventListener('click', () => handleBackupAction('create'));
    async function openBackupsModal() {
        backupsModal.classList.remove('hidden');
        backupOutput.textContent = '';
        await refreshBackupList();
    }
    async function refreshBackupList() {
        backupsList.innerHTML = '<p>Cargando...</p>';
        try {
            const data = await apiCall('/api/backups', { connectionId: state.connectionId, action: 'list' });
            const backups = data.backups || [];
            if (backups.length === 0) { backupsList.innerHTML = '<p>No hay copias disponibles.</p>'; return; }
            backupsList.innerHTML = backups.map(b => `<li class="flex justify-between items-center mb-1"><span>${b.name} (${b.size})</span><div><button data-file="${b.name}" class="restore-backup mr-2 text-blue-400">Restaurar</button><button data-file="${b.name}" class="delete-backup text-red-500">Eliminar</button></div></li>`).join('');
            backupsList.querySelectorAll('.restore-backup').forEach(btn => btn.addEventListener('click', () => handleBackupAction('restore', btn.dataset.file)));
            backupsList.querySelectorAll('.delete-backup').forEach(btn => btn.addEventListener('click', () => handleBackupAction('delete', btn.dataset.file)));
        } catch (error) {
            backupsList.innerHTML = `<p class="text-red-400">${error.message}</p>`;
        }
    }
    async function handleBackupAction(action, file) {
        backupOutput.textContent = '';
        try {
            if (action === 'delete') {
                if (!confirm(`¿Eliminar copia ${file}?`)) return;
                await apiCall('/api/backups', { connectionId: state.connectionId, action: 'delete', file });
                await refreshBackupList();
                return;
            }
            const body = { connectionId: state.connectionId, action };
            if (file) body.file = file;
            const res = await fetch(`${API_BASE}/api/backups`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            while (!done) {
                const { value, done: finished } = await reader.read();
                if (value) backupOutput.textContent += decoder.decode(value);
                done = finished;
            }
            await refreshBackupList();
        } catch (error) {
            backupOutput.textContent += `\nERROR: ${error.message}`;
        }
    }
});

