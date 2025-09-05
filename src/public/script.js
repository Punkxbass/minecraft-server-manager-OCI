document.addEventListener('DOMContentLoaded', () => {
    const state = {
        connectionId: null,
        sshKeyContent: null,
        lastStatusOutput: '',
        resourceMonitorInterval: null,
        vpsTerm: null,
        vpsSocket: null,
    };

    const CONSOLE_BUFFER_LIMIT = 1000;
    let consoleBuffer = [];
    const addToBuffer = (line) => {
        if (consoleBuffer.length >= CONSOLE_BUFFER_LIMIT) consoleBuffer.shift();
        consoleBuffer.push(line);
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
    const importPresetBtn = document.getElementById('import-preset-btn');
    const exportPresetBtn = document.getElementById('export-preset-btn');
    const presetFileInput = document.getElementById('preset-file-input');
    const vpsConsole = document.getElementById('vps-console');
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
    const minRamInput = document.getElementById('min-ram');
    const maxRamInput = document.getElementById('max-ram');
    const installerOutput = document.getElementById('installer-output');
    const installServerBtn = document.getElementById('install-server-btn');
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
    const fileExplorerBtn = document.getElementById('file-explorer-btn');
    const fileExplorerModal = document.getElementById('file-explorer-modal');
    const fileExplorerCloseBtn = document.getElementById('file-explorer-close-btn');
    const fileExplorerBody = document.getElementById('file-explorer-body');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    const rebootVpsBtn = document.getElementById('reboot-vps-btn');
    const downloadScreenLogBtn = document.getElementById('download-screen-log-btn');
    const downloadVpsLogBtn = document.getElementById('download-vps-log-btn');
    const downloadCompleteLogBtn = document.getElementById('download-complete-log-btn');
    const attachMinecraftScreenBtn = document.getElementById('attach-minecraft-screen');
    const detachMinecraftScreenBtn = document.getElementById('detach-minecraft-screen');
    const quickCommandInput = document.getElementById('quick-command-input');
    const sendQuickCommandBtn = document.getElementById('send-quick-command');
    const modsGuideBtn = document.getElementById('mods-guide-btn');
    const onlinePlayersList = document.getElementById('online-players-list');
    const refreshOnlineBtn = document.getElementById('refresh-online-btn');
    const adminPlayerName = document.getElementById('admin-player-name');
    const kickPlayerBtn = document.getElementById('kick-player-btn');
    const banPlayerBtn = document.getElementById('ban-player-btn');
    const pardonPlayerBtn = document.getElementById('pardon-player-btn');
    const gmSurvivalBtn = document.getElementById('gm-survival-btn');
    const gmCreativeBtn = document.getElementById('gm-creative-btn');

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

    // Modal de confirmación genérico que devuelve una promesa
    function showConfirmationModal({ title, message, confirmText = 'Aceptar', cancelText = 'Cancelar' }) {
        return new Promise((resolve) => {
            showModal(title, `<p>${message}</p>`,
                `<div class="flex gap-2">`+
                `<button id="confirm-btn" class="px-3 py-1 bg-red-600 rounded">${confirmText}</button>`+
                `<button id="cancel-btn" class="px-3 py-1 bg-gray-600 rounded">${cancelText}</button>`+
                `</div>`);
            document.getElementById('confirm-btn').addEventListener('click', () => { hideModal(); resolve(true); });
            document.getElementById('cancel-btn').addEventListener('click', () => { hideModal(); resolve(false); });
        });
    }
    const showInstallerModal = () => installerModal.classList.remove('hidden');
    const hideInstallerModal = () => installerModal.classList.add('hidden');
    openInstallerBtn.addEventListener('click', () => { handleServerTypeChange(); showInstallerModal(); });
    installerCloseBtn.addEventListener('click', hideInstallerModal);
    installServerBtn.addEventListener('click', async () => {
        const serverType = serverTypeSelect.value;
        const mcVersion = minecraftVersionSelect.value;
        const properties = collectInstallerProperties();
        const minRam = minRamInput.value.trim();
        const maxRam = maxRamInput.value.trim();
        if (!serverType || !mcVersion) { installerOutput.textContent = 'Debe seleccionar tipo y versión.'; return; }
        installerOutput.textContent = '';
        installServerBtn.disabled = true;
        try {
            const res = await fetch('/api/install-server', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: state.connectionId, serverType, mcVersion, properties, minRam, maxRam })
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let logText = '';
            let installResult = null;
            while (!done) {
                const { value, done: finished } = await reader.read();
                if (value) {
                    const chunk = decoder.decode(value);
                    installerOutput.textContent += chunk;
                    logText += chunk;
                    if (chunk.includes('__INSTALL_DONE__')) {
                        const ip = (chunk.match(/IP=([^\s]+)/) || [])[1] || vpsIpInput.value;
                        const port = (chunk.match(/PORT=([^\s]+)/) || [])[1] || '25565';
                        const name = (chunk.match(/NAME=([^\s]*)/) || [])[1] || '';
                        const motdMatch = chunk.match(/MOTD=(.*)/);
                        const motd = motdMatch ? motdMatch[1] : '';
                        installResult = { ip, port, name, motd };
                    }
                }
                done = finished;
            }
            hideInstallerModal();
            if (installResult) {
                await checkServerStatus();
                showModal('Instalación completada', `<p>El servidor se ha instalado e iniciado correctamente.</p><p>IP: ${installResult.ip}</p><p>Puerto: ${installResult.port}</p><p>Nombre: ${installResult.name}</p><p>MOTD: ${installResult.motd}</p>`);
            } else {
                showModal('Instalación fallida', '<p>Ocurrió un error durante la instalación. Se generó un log.</p>',
                    `<div class="flex gap-2">`+
                    `<button id="view-log-btn" class="px-3 py-1 bg-blue-600 rounded">Ver log</button>`+
                    `<button id="download-install-log-btn" class="px-3 py-1 bg-green-600 rounded">Descargar Log de Instalación</button>`+
                    `<button id="close-log-btn" class="px-3 py-1 bg-gray-600 rounded">Cerrar</button>`+
                    `</div>`);
                const viewBtn = document.getElementById('view-log-btn');
                const downloadBtn = document.getElementById('download-install-log-btn');
                const closeBtn = document.getElementById('close-log-btn');
                viewBtn.addEventListener('click', () => showModal('Log de instalación', `<pre class="whitespace-pre-wrap text-sm">${logText}</pre>`));
                downloadBtn.addEventListener('click', async () => {
                    try {
                        const res = await fetch(`/api/download-install-log?connectionId=${state.connectionId}`);
                        if (!res.ok) throw new Error('No se pudo descargar el log.');
                        const blob = await res.blob();
                        downloadFile('install.log', blob);
                    } catch (err) {
                        showModal('Error', `<p class="text-red-400">${err.message}</p>`);
                    }
                });
                closeBtn.addEventListener('click', hideModal);
            }
        } catch (error) {
            installerOutput.textContent += `\nERROR: ${error.message}`;
            hideInstallerModal();
            showModal('Instalación fallida', `<p class="text-red-400">${error.message}</p>`);
        } finally {
            installServerBtn.disabled = false;
        }
    });

    // --- Lógica de API ---
    async function apiCall(endpoint, body, method = 'POST') {
        try {
            const options = { method, headers: { 'Content-Type': 'application/json' }};
            if (method !== 'GET') options.body = JSON.stringify(body);
            const response = await fetch(endpoint, options);
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
            await checkServerStatus(); startVpsTerminal(); startResourceMonitor();
        } catch (error) { loginError.textContent = `Error: ${error.message}`;
        } finally { connectBtn.disabled = false; connectBtn.textContent = 'Conectar'; }
    }
    connectBtn.addEventListener('click', connectToServer);
    disconnectBtn.addEventListener('click', () => {
        if (state.connectionId) apiCall('/api/logout', { connectionId: state.connectionId });
        stopVpsTerminal(); stopResourceMonitor();
        state.connectionId = null; state.sshKeyContent = null;
        vpsIpInput.value = ''; sshUserInput.value = ''; sshKeyInput.value = ''; sshKeyFileName.textContent = '';
        loginError.textContent = '';
        vpsConsole.innerHTML = ''; notificationArea.innerHTML = '';
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
          reader.onload = async (e) => {
              try {
                  const cfg = JSON.parse(e.target.result);
                  vpsIpInput.value = cfg.vpsIp || '';
                  sshUserInput.value = cfg.sshUser || '';
                  if (cfg.sshKey) { state.sshKeyContent = cfg.sshKey; sshKeyFileName.textContent = 'Llave importada'; }
                  await connectToServer();
              } catch { alert('Archivo de configuración inválido'); }
          };
          reader.readAsText(file);
      });

      importPresetBtn.addEventListener('click', () => presetFileInput.click());
      presetFileInput.addEventListener('change', async (event) => {
          const file = event.target.files[0]; if (!file) return;
          try {
              const cfg = JSON.parse(await file.text());
              serverTypeSelect.value = cfg.serverType || 'vanilla';
              await populateVersionDropdowns();
              modsGuideBtn.classList.toggle('hidden', serverTypeSelect.value !== 'fabric');
              if (cfg.mcVersion) minecraftVersionSelect.value = cfg.mcVersion;
              minRamInput.value = cfg.minRam || '4G';
              maxRamInput.value = cfg.maxRam || '8G';
              Object.entries(cfg.properties || {}).forEach(([k, v]) => {
                  const el = document.getElementById(`prop-${k}`);
                  if (el) el.value = v;
              });
          } catch { alert('Preset inválido'); }
      });
      exportPresetBtn.addEventListener('click', () => {
          const preset = {
              serverType: serverTypeSelect.value,
              mcVersion: minecraftVersionSelect.value,
              minRam: minRamInput.value.trim(),
              maxRam: maxRamInput.value.trim(),
              properties: collectInstallerProperties()
          };
          downloadFile('server-preset.json', JSON.stringify(preset, null, 2));
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
            const statusText = data.isActive ?
                `✅ ¡Servidor activo! IP: \`${vpsIpInput.value}:25565\`` :
                'ℹ️ Servidor detenido o no instalado.';

            notificationArea.innerHTML = statusText;
            notificationArea.className = `mb-6 p-4 rounded-lg ${data.isActive ? 'bg-green-600' : 'bg-blue-600'}`;

            // Actualizar botones según el estado
            document.querySelectorAll('.server-control-btn').forEach(btn => {
                if (btn.dataset.action === 'start') {
                    btn.disabled = data.isActive;
                } else if (btn.dataset.action === 'stop') {
                    btn.disabled = !data.isActive;
                }
            });

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
            } catch {}
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

        } catch (error) { 
            showModal(`Error al ejecutar '${action}'`, `<p class="text-red-400">${error.message}</p>`);
        }
    }));

    deepCleanBtn.addEventListener('click', () => {
        showModal(
            'Eliminar Servidor',
            '<p>Esta acción borrará todos los datos de la VPS y dejará la instancia como nueva. ¿Deseas continuar?</p>',
            '<button id="backup-server-btn" class="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg mr-2">Respaldar Servidor</button><button id="confirm-deep-clean-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Confirmar Formateo</button>'
        );
        document.getElementById('backup-server-btn').addEventListener('click', async () => {
            try {
                const res = await fetch(`/api/export-server?connectionId=${state.connectionId}`);
                const blob = await res.blob();
                downloadFile('server-backup.tar.gz', blob);
            } catch (err) {
                alert(err.message);
            }
        });
        document.getElementById('confirm-deep-clean-btn').addEventListener('click', async () => {
            showModal('Formateando VPS', '<p>Ejecutando limpieza...</p>');
            try {
                const data = await apiCall('/api/deep-clean', { connectionId: state.connectionId });
                showModal('Limpieza Completada', `<pre>${data.output}</pre>`);
                await checkServerStatus();
            } catch (error) {
                showModal('Error en la Limpieza', `<p class="text-red-400">${error.message}</p>`);
            }
        });
    });

      function collectInstallerProperties() {
          const inputs = document.querySelectorAll('#installer-form-section [id^="prop-"]');
          return Array.from(inputs).reduce((acc, el) => {
              const key = el.id.replace('prop-', '');
              acc[key] = el.value;
              return acc;
          }, {});
      }

      function downloadFile(filename, content) {
        const blob = content instanceof Blob ? content : new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: filename });
        document.body.appendChild(a); a.click();
        URL.revokeObjectURL(url); a.remove();
    }
    function exportSessionLog() { downloadFile(`status-log-${new Date().toISOString()}.txt`, state.lastStatusOutput); }
    clearConsoleBtn.addEventListener('click', async () => {
        state.vpsTerm?.clear();
        consoleBuffer = [];
        try {
            await apiCall('/api/clear-console', { connectionId: state.connectionId });
        } catch (error) {
            showModal('Error', `<p class="text-red-400">${error.message}</p>`);
        }
    });
    rebootVpsBtn.addEventListener('click', async () => {
        const confirmation = await showConfirmationModal({
            title: 'Confirmar Reinicio VPS',
            message: '¿Está seguro de que desea reiniciar el VPS? Esta acción interrumpirá el servidor.',
            confirmText: 'Reiniciar',
            cancelText: 'Cancelar'
        });
        if (!confirmation) return;
        try {
            await apiCall('/api/reboot-vps', { connectionId: state.connectionId });
            showModal('Reinicio en proceso', '<p>La VPS se está reiniciando.</p>');
        } catch (error) {
            showModal('Error', `<p class="text-red-400">${error.message}</p>`);
        }
    });
    attachMinecraftScreenBtn.addEventListener('click', () => {
        if (state.vpsTerm && state.vpsSocket) {
            state.vpsSocket.send('screen -r minecraft-console\r');
        }
    });

    detachMinecraftScreenBtn.addEventListener('click', () => {
        if (state.vpsTerm && state.vpsSocket) {
            state.vpsSocket.send('\u0001d');
        }
    });

    sendQuickCommandBtn.addEventListener('click', () => {
        const command = quickCommandInput.value.trim();
        if (command && state.vpsSocket) {
            state.vpsSocket.send(command + '\r');
            quickCommandInput.value = '';
        }
    });

    downloadScreenLogBtn.addEventListener('click', async () => {
        try {
            const res = await fetch(`/api/download-screen-log?connectionId=${state.connectionId}`);
            if (!res.ok) throw new Error('No se pudo descargar el log de screen.');
            const blob = await res.blob();
            downloadFile('screen.log', blob);
        } catch (error) {
            showModal('Error', `<p class="text-red-400">${error.message}</p>`);
        }
    });

    downloadVpsLogBtn.addEventListener('click', async () => {
        try {
            const res = await fetch(`/api/download-vps-log?connectionId=${state.connectionId}`);
            if (!res.ok) throw new Error('No se pudo descargar el log del VPS.');
            const blob = await res.blob();
            downloadFile('vps.log', blob);
        } catch (error) {
            showModal('Error', `<p class="text-red-400">${error.message}</p>`);
        }
    });
    downloadCompleteLogBtn.addEventListener('click', async () => {
        try {
            const res = await fetch(`/api/download-complete-log?connectionId=${state.connectionId}`);
            if (!res.ok) throw new Error('No se pudo descargar el log completo.');
            const blob = await res.blob();
            downloadFile('complete.log', blob);
        } catch (error) {
            showModal('Error', `<p class="text-red-400">${error.message}</p>`);
        }
    });
    serverTypeSelect.addEventListener('change', handleServerTypeChange);
    modsGuideBtn.addEventListener('click', async () => {
        try {
            const data = await apiCall('/api/get-guide?file=mods-guide.md', {}, 'GET');
            showModal('Instalar mods', data.content);
        } catch (error) {
            showModal('Error', `<p class="text-red-400">${error.message}</p>`);
        }
    });

    function sendCommandDirect(command) {
        if (!command) return;
        apiCall('/api/send-command', { connectionId: state.connectionId, command }).catch(err => {
            showModal('Error', `<p class="text-red-400">${err.message}</p>`);
        });
    }

    function startVpsTerminal() {
        stopVpsTerminal();
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const socket = new WebSocket(`${protocol}://${location.host}/ws/vps?connectionId=${state.connectionId}`);
        state.vpsSocket = socket;
        const term = new Terminal({ cursorBlink: true });
        const fitAddon = new FitAddon.FitAddon();
        const attachAddon = new AttachAddon.AttachAddon(socket, { bidirectional: true });
        term.loadAddon(fitAddon);
        term.loadAddon(attachAddon);
        term.open(vpsConsole);
        fitAddon.fit();
        term.focus();
        vpsConsole.addEventListener('click', () => term.focus());
        socket.addEventListener('open', () => term.focus());
        socket.addEventListener('message', (e) => {
            e.data.split(/\r?\n/).forEach(addToBuffer);
        });
        window.addEventListener('resize', () => fitAddon.fit());
        state.vpsTerm = term;
    }
    function stopVpsTerminal() {
        if (state.vpsSocket) {
            state.vpsSocket.close();
            state.vpsSocket = null;
        }
        if (state.vpsTerm) {
            state.vpsTerm.dispose();
            state.vpsTerm = null;
        }
    }

    async function populateVersionDropdowns() {
        const type = serverTypeSelect.value;
        minecraftVersionSelect.innerHTML = '<option value="">Cargando...</option>';
        try {
            const data = await apiCall(`/api/minecraft-versions?type=${type}`, {}, 'GET');
            minecraftVersionSelect.innerHTML = data.versions.map(v => `<option value="${v}">${v}</option>`).join('');
        } catch { minecraftVersionSelect.innerHTML = '<option value="">Error</option>'; }
    }
    function handleServerTypeChange() {
        populateVersionDropdowns();
        modsGuideBtn.classList.toggle('hidden', serverTypeSelect.value !== 'fabric');
    }

      openFirewallBtn.addEventListener('click', async () => {
          const compartmentId = compartmentIdInput.value.trim();
        if (!compartmentId) { showModal('Firewall', '<p class="text-red-400">Debes proporcionar el OCID del compartimento.</p>'); return; }
        showModal('Abriendo puertos', '<p>Configurando firewall en OCI y VPS...</p>');
        try {
            const oci = await apiCall('/api/open-oci-firewall', { compartmentId });
            let message = `<p>${oci.message}</p>`;
            if (state.connectionId) {
                const res = await fetch('/api/open-ufw', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ connectionId: state.connectionId }) });
                const text = await res.text();
                message += `<pre class="bg-black p-2 rounded mt-2 whitespace-pre-wrap">${text}</pre>`;
            }
            showModal('Firewall', message);
        } catch (error) {
            showModal('Error', `<p class="text-red-400">${error.message}</p>`);
        }
      });

      editPropertiesBtn.addEventListener('click', async () => {
          propertiesModal.classList.remove('hidden');
          propertiesBody.innerHTML = '<p>Cargando...</p>';
          try {
              const data = await apiCall(`/api/get-properties?connectionId=${state.connectionId}`, {}, 'GET');
              propertiesBody.innerHTML = '';
              Object.entries(data.properties || {}).forEach(([key, value]) => {
                  const div = document.createElement('div');
                  div.innerHTML = `<label for="propedit-${key}" class="text-sm">${key}</label><input id="propedit-${key}" data-key="${key}" value="${value}" class="w-full bg-gray-700 text-sm p-2 rounded">`;
                  propertiesBody.appendChild(div);
              });
          } catch (error) {
              propertiesBody.innerHTML = `<p class="text-red-400">${error.message}</p>`;
          }
      });
      propertiesCloseBtn.addEventListener('click', () => propertiesModal.classList.add('hidden'));
      savePropertiesBtn.addEventListener('click', async () => {
          const inputs = propertiesBody.querySelectorAll('input');
          const props = {};
          inputs.forEach(i => props[i.dataset.key] = i.value);
          try {
              await apiCall('/api/save-properties', { connectionId: state.connectionId, properties: props });
              propertiesModal.classList.add('hidden');
              showModal('Propiedades', '<p>server.properties actualizado.</p>');
          } catch (err) {
              alert(err.message);
          }
      });

      // --- Gestión de jugadores ---
    managePlayersBtn.addEventListener('click', loadPlayersModal);
    playersCloseBtn.addEventListener('click', () => playersModal.classList.add('hidden'));
    async function loadPlayersModal() {
        playersModal.classList.remove('hidden');
        opsList.innerHTML = '<p>Cargando...</p>';
        whitelistList.innerHTML = '<p>Cargando...</p>';
        onlinePlayersList.innerHTML = '<p>Cargando...</p>';
        try {
            const data = await apiCall(`/api/get-players?connectionId=${state.connectionId}`, {}, 'GET');
            renderPlayerLists(data.ops || [], data.whitelist || []);
            await refreshOnlinePlayers();
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
    async function refreshOnlinePlayers() {
        try {
            const data = await apiCall(`/api/players/online?connectionId=${state.connectionId}`, {}, 'GET');
            renderOnlinePlayers(data.players || []);
        } catch (error) {
            onlinePlayersList.innerHTML = `<p class="text-red-400">${error.message}</p>`;
        }
    }
    function renderOnlinePlayers(players) {
        onlinePlayersList.innerHTML = '';
        if (players.length === 0) {
            onlinePlayersList.innerHTML = '<p>No hay jugadores conectados.</p>';
            return;
        }
        players.forEach(p => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center mb-1';
            li.innerHTML = `<span>${p}</span><button data-username="${p}" class="kick-player text-red-500 text-sm">Kick</button>`;
            onlinePlayersList.appendChild(li);
        });
        onlinePlayersList.querySelectorAll('.kick-player').forEach(btn => btn.addEventListener('click', () => sendCommandDirect(`kick ${btn.dataset.username}`)));
    }
    refreshOnlineBtn.addEventListener('click', refreshOnlinePlayers);
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

    // comandos de administración adicionales
    function playerAdminCommand(template) {
        const name = adminPlayerName.value.trim();
        if (!name) { alert('Ingresa un nombre de jugador'); return; }
        sendCommandDirect(template.replace('{player}', name));
    }
    kickPlayerBtn.addEventListener('click', () => playerAdminCommand('kick {player}'));
    banPlayerBtn.addEventListener('click', () => playerAdminCommand('ban {player}'));
    pardonPlayerBtn.addEventListener('click', () => playerAdminCommand('pardon {player}'));
    gmSurvivalBtn.addEventListener('click', () => playerAdminCommand('gamemode survival {player}'));
    gmCreativeBtn.addEventListener('click', () => playerAdminCommand('gamemode creative {player}'));

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
            const res = await fetch('/api/backups', {
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

    // --- Explorador de Archivos ---
    fileExplorerBtn.addEventListener('click', () => {
        loadDirectory('');
        fileExplorerModal.classList.remove('hidden');
    });
    fileExplorerCloseBtn.addEventListener('click', () => fileExplorerModal.classList.add('hidden'));

    async function loadDirectory(dir) {
        try {
            const data = await apiCall('/api/list-files', { connectionId: state.connectionId, dir });
            renderFileList(data.entries, dir);
        } catch (err) {
            fileExplorerBody.innerHTML = `<p class="text-red-400">${err.message}</p>`;
        }
    }
    function renderFileList(entries, dir) {
        fileExplorerBody.innerHTML = '';
        const pathLabel = document.createElement('p');
        pathLabel.className = 'mb-2 text-sm text-gray-400';
        pathLabel.textContent = '/' + dir;
        fileExplorerBody.appendChild(pathLabel);
        const controls = document.createElement('div');
        controls.className = 'mb-2 flex gap-2';
        const newFolderBtn = document.createElement('button');
        newFolderBtn.textContent = 'Nueva carpeta';
        newFolderBtn.className = 'px-2 py-1 bg-blue-700 rounded';
        newFolderBtn.addEventListener('click', async () => {
            const name = prompt('Nombre de la carpeta:');
            if (!name) return;
            const newPath = dir ? `${dir}/${name}` : name;
            try {
                await fileAction('mkdir', newPath);
                loadDirectory(dir);
            } catch (err) { alert(err.message); }
        });
        controls.appendChild(newFolderBtn);
        fileExplorerBody.appendChild(controls);
        const list = document.createElement('ul');
        list.className = 'space-y-1';
        if (dir) {
            const parent = dir.split('/').slice(0, -1).join('/');
            const li = document.createElement('li');
            li.innerHTML = `<button class="text-blue-400 fe-nav" data-path="${parent}">../</button>`;
            list.appendChild(li);
        }
        entries.forEach(e => {
            const li = document.createElement('li');
            if (e.type === 'dir') {
                const newPath = dir ? dir + '/' + e.name : e.name;
                li.innerHTML = `<span class="text-blue-400 fe-nav cursor-pointer" data-path="${newPath}">${e.name}/</span> <button class="fe-rename text-yellow-400 ml-2" data-path="${newPath}">Ren</button> <button class="fe-delete text-red-400 ml-1" data-path="${newPath}">Del</button> <button class="fe-move text-purple-400 ml-1" data-path="${newPath}">Mov</button> <button class="fe-copy text-green-400 ml-1" data-path="${newPath}">Copy</button>`;
            } else {
                const filePath = dir ? dir + '/' + e.name : e.name;
                li.innerHTML = `<span class="text-green-400 fe-download cursor-pointer" data-path="${filePath}">${e.name}</span> <button class="fe-rename text-yellow-400 ml-2" data-path="${filePath}">Ren</button> <button class="fe-delete text-red-400 ml-1" data-path="${filePath}">Del</button> <button class="fe-move text-purple-400 ml-1" data-path="${filePath}">Mov</button> <button class="fe-copy text-green-400 ml-1" data-path="${filePath}">Copy</button>`;
            }
            list.appendChild(li);
        });
        fileExplorerBody.appendChild(list);
        fileExplorerBody.querySelectorAll('.fe-nav').forEach(btn => btn.addEventListener('click', () => loadDirectory(btn.dataset.path)));
        fileExplorerBody.querySelectorAll('.fe-download').forEach(btn => btn.addEventListener('click', () => downloadRemoteFile(btn.dataset.path)));
        fileExplorerBody.querySelectorAll('.fe-delete').forEach(btn => btn.addEventListener('click', async () => {
            if (!confirm('¿Eliminar?')) return;
            try { await fileAction('delete', btn.dataset.path); loadDirectory(dir); } catch (err) { alert(err.message); }
        }));
        fileExplorerBody.querySelectorAll('.fe-rename').forEach(btn => btn.addEventListener('click', async () => {
            const newName = prompt('Nuevo nombre:');
            if (!newName) return;
            const parent = btn.dataset.path.split('/').slice(0, -1).join('/');
            const dest = parent ? parent + '/' + newName : newName;
            try { await fileAction('rename', btn.dataset.path, dest); loadDirectory(dir); } catch (err) { alert(err.message); }
        }));
        fileExplorerBody.querySelectorAll('.fe-move').forEach(btn => btn.addEventListener('click', async () => {
            const dest = prompt('Mover a (ruta completa):', btn.dataset.path);
            if (!dest) return;
            try { await fileAction('move', btn.dataset.path, dest); loadDirectory(dir); } catch (err) { alert(err.message); }
        }));
        fileExplorerBody.querySelectorAll('.fe-copy').forEach(btn => btn.addEventListener('click', async () => {
            const dest = prompt('Copiar a (ruta completa):', btn.dataset.path);
            if (!dest) return;
            try { await fileAction('copy', btn.dataset.path, dest); loadDirectory(dir); } catch (err) { alert(err.message); }
        }));
    }

    async function fileAction(action, src, dest) {
        const body = { connectionId: state.connectionId, action, src };
        if (dest) body.dest = dest;
        await apiCall('/api/file-manager', body);
    }
    async function downloadRemoteFile(file) {
        try {
            const res = await fetch(`/api/download-file?connectionId=${state.connectionId}&file=${encodeURIComponent(file)}`);
            if (!res.ok) throw new Error('Error al descargar archivo');
            const blob = await res.blob();
            downloadFile(file.split('/').pop(), blob);
        } catch (err) {
            alert(err.message);
        }
    }
});

