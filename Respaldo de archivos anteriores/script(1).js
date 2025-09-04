// script.js — Frontend for "Minecraft Server Manager OCI"
// Talks to server.js on http://localhost:3000

document.addEventListener('DOMContentLoaded', () => {
  const state = {
    connectionId: null,
    eventSource: null,
    sshKeyContent: null,
    lastStatusOutput: '',
    resourceMonitorInterval: null,
  };

  // ---- Selectors ----
  const loginView = document.getElementById('login-view');
  const mainView = document.getElementById('main-view');

  // Login
  const vpsIpInput = document.getElementById('vps-ip');
  const sshUserInput = document.getElementById('ssh-user');
  const sshKeyInput = document.getElementById('ssh-key-input');
  const sshKeyUploadBtn = document.getElementById('ssh-key-upload-btn');
  const sshKeyFileName = document.getElementById('ssh-key-file-name');
  const connectBtn = document.getElementById('connect-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const loginError = document.getElementById('login-error');
  const importBtn = document.getElementById('import-config-btn');
  const exportConfigBtn = document.getElementById('export-config-btn');
  const openFirewallBtn = document.getElementById('open-firewall-btn');
  const compartmentIdInput = document.getElementById('compartment-id');

  // Hidden file input for importing connection config (created if missing)
  let configFileInput =
    document.getElementById('config-file-input') ||
    (() => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      inp.id = 'config-file-input';
      inp.className = 'hidden';
      document.body.appendChild(inp);
      return inp;
    })();

  // Installer
  const openInstallerBtn = document.getElementById('open-installer-btn');
  const installerModal = document.getElementById('installer-modal');
  const installerCloseBtn = document.getElementById('installer-close-btn');
  const installServerBtn = document.getElementById('install-server-btn');
  const serverTypeSelect = document.getElementById('server-type');
  const mcVersionSelect = document.getElementById('minecraft-version');
  const installerOutput = document.getElementById('installer-output');
  const importPresetBtn = document.getElementById('import-preset-btn');
  const exportPresetBtn = document.getElementById('export-preset-btn');
  const presetFileInput = document.getElementById('preset-file-input');

  // Resources
  const notificationArea = document.getElementById('server-status-notification');
  const cpuUsageEl = document.getElementById('cpu-usage');
  const ramUsageEl = document.getElementById('ram-usage');
  const diskUsageEl = document.getElementById('disk-usage');

  const serverControlBtns = document.querySelectorAll('.server-control-btn');
  const deepCleanBtn = document.getElementById('deep-clean-btn');
  const exportLatestLogBtn = document.getElementById('export-latest-log-btn');

  const logConsole = document.getElementById('log-console');
  const commandInput = document.getElementById('command-input');
  const sendCommandBtn = document.getElementById('send-command-btn');
  const commandPresetBtns = document.querySelectorAll('.command-preset-btn');

  // Properties editor
  const editPropertiesBtn = document.getElementById('edit-properties-btn');
  const propertiesModal = document.getElementById('properties-modal');
  const propertiesCloseBtn = document.getElementById('properties-close-btn');
  const propertiesBody = document.getElementById('properties-body');
  const savePropertiesBtn = document.getElementById('save-properties-btn');

  // Players
  const managePlayersBtn = document.getElementById('manage-players-btn');
  const playersModal = document.getElementById('players-modal');
  const playersCloseBtn = document.getElementById('players-close-btn');
  const opsList = document.getElementById('ops-list');
  const whitelistList = document.getElementById('whitelist-list');
  const addOpBtn = document.getElementById('add-op-btn');
  const addWhitelistBtn = document.getElementById('add-whitelist-btn');

  // Backups
  const manageBackupsBtn = document.getElementById('manage-backups-btn');
  const backupsModal = document.getElementById('backups-modal');
  const backupsCloseBtn = document.getElementById('backups-close-btn');
  const createBackupBtn = document.getElementById('create-backup-btn');
  const backupOutput = document.getElementById('backup-output');
  const backupsList = document.getElementById('backups-list');

  // Generic modal
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  const showModal = (title, content, footerContent = '') => {
    modalTitle.textContent = title;
    modalBody.innerHTML = `<div class="prose prose-invert max-w-none text-gray-300">${content}</div>`;
    modalFooter.innerHTML = footerContent || '';
    modal.classList.remove('hidden');
  };
  const hideModal = () => modal.classList.add('hidden');
  modalCloseBtn.addEventListener('click', hideModal);

  // ---- Utils ----
  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  }

  async function apiCall(endpoint, body, method = 'POST') {
    const url = `http://localhost:3000${endpoint}`;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (method !== 'GET') opts.body = JSON.stringify(body || {});
    const res = await fetch(url, opts);
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    if (!res.ok) {
      let msg = 'Error en el servidor';
      if (isJson) { try { msg = (await res.json()).message || msg; } catch {} }
      throw new Error(msg);
    }
    if (isJson) return res.json();
    const text = await res.text();
    // Si el backend devolvió JSON con content-type text/plain (p.ej. backups list), intenta parsear.
    try { return JSON.parse(text); } catch { return text; }
  }

  // ---- Connect / Disconnect ----
  async function connectToServer() {
    const vpsIp = vpsIpInput.value.trim();
    const sshUser = sshUserInput.value.trim();
    if (!vpsIp || !sshUser || !state.sshKeyContent) {
      loginError.textContent = 'IP, Usuario y Llave SSH son obligatorios.';
      return;
    }
    loginError.textContent = '';
    connectBtn.disabled = true;
    connectBtn.textContent = 'Conectando...';
    try {
      const data = await apiCall('/api/connect', { vpsIp, username: sshUser, sshKey: state.sshKeyContent });
      state.connectionId = data.connectionId;
      loginView.classList.add('hidden');
      mainView.classList.remove('hidden');
      await checkServerStatus();
      startResourceMonitoring();
      startLiveLogs();
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = 'Conectar';
    }
  }

  connectBtn.addEventListener('click', connectToServer);

  disconnectBtn.addEventListener('click', async () => {
    if (state.connectionId) apiCall('/api/disconnect', { connectionId: state.connectionId }).catch(() => {});
    stopLiveLogs();
    stopResourceMonitoring();
    state.connectionId = null;
    state.sshKeyContent = null;
    sshKeyFileName.textContent = '';
    logConsole.innerHTML = '';
    notificationArea.innerHTML = '';
    mainView.classList.add('hidden');
    loginView.classList.remove('hidden');
  });

  // ---- SSH key upload ----
  sshKeyUploadBtn.addEventListener('click', () => sshKeyInput.click());
  sshKeyInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.sshKeyContent = ev.target.result;
      sshKeyFileName.textContent = `Archivo: ${file.name}`;
      loginError.textContent = '';
    };
    reader.readAsText(file);
  });

  // ---- Import config and auto-connect ----
  importBtn.addEventListener('click', () => configFileInput.click());
  configFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const cfg = JSON.parse(ev.target.result);
        vpsIpInput.value = cfg.vpsIp || '';
        sshUserInput.value = cfg.sshUser || 'ubuntu';
        state.sshKeyContent = cfg.sshKey || null;
        sshKeyFileName.textContent = cfg.sshKey ? 'Llave importada' : '';
        await connectToServer();
      } catch {
        loginError.textContent = 'Archivo de configuracion invalido.';
      }
    };
    reader.readAsText(file);
  });

  // Manual connect on Enter
  [vpsIpInput, sshUserInput].forEach((el) =>
    el.addEventListener('keydown', (e) => e.key === 'Enter' && connectToServer())
  );

  // ---- Resources ----
  async function updateResources() {
    if (!state.connectionId) return;
    try {
      const { data } = await apiCall(`/api/get-resources?connectionId=${state.connectionId}`, {}, 'GET');
      const cpu = Math.round(Number(data.CPU_USAGE || 0));
      cpuUsageEl.textContent = Number.isFinite(cpu) ? `${cpu} %` : '- %';

      const [usedM, totalM] = String(data.RAM_DATA || '0/0').split('/').map((x) => parseInt(x, 10) || 0);
      ramUsageEl.textContent = `${usedM} / ${totalM} MB`;

      let used = '-', total = '-', percent = '-%';
      if (data.DISK_DATA) {
        const parts = String(data.DISK_DATA).split(' ');
        const ut = (parts[0] || '').split('/');
        used = ut[0] || '-';
        total = ut[1] || '-';
        percent = parts[1] || '-%';
      }
      diskUsageEl.textContent = `${used} / ${total} (${percent})`;
    } catch {
      // silent
    }
  }
  function startResourceMonitoring() {
    stopResourceMonitoring();
    updateResources();
    state.resourceMonitorInterval = setInterval(updateResources, 5000);
  }
  function stopResourceMonitoring() {
    if (state.resourceMonitorInterval) {
      clearInterval(state.resourceMonitorInterval);
      state.resourceMonitorInterval = null;
    }
  }

  // ---- Server status banner ----
  async function checkServerStatus() {
    if (!state.connectionId) return;
    try {
      const { isActive } = await apiCall('/api/server-status', { connectionId: state.connectionId });
      notificationArea.textContent = isActive
        ? `SERVIDOR ACTIVO - IP publica: ${vpsIpInput.value}:25565`
        : 'SERVIDOR DETENIDO';
      notificationArea.className = `mb-6 p-4 rounded-lg text-white font-semibold ${isActive ? 'bg-green-600' : 'bg-blue-600'}`;
    } catch (error) {
      notificationArea.textContent = `Error al comprobar estado: ${error.message}`;
      notificationArea.className = 'mb-6 p-4 rounded-lg bg-red-600 text-white font-semibold';
    }
  }

  // ---- Basic controls ----
  serverControlBtns.forEach((btn) =>
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      showModal(
        `Ejecutando: ${action}`,
        `<p>Enviando comando al servidor...</p><pre id="modal-output" class="bg-black p-2 rounded text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">...</pre>`
      );
      const outputEl = document.getElementById('modal-output');
      try {
        const data = await apiCall('/api/server-control', { connectionId: state.connectionId, action });
        state.lastStatusOutput = data.output || '';
        outputEl.textContent = state.lastStatusOutput;
        showModal(
          `Resultado de '${action}'`,
          `<pre class="bg-black p-2 rounded text-sm whitespace-pre-wrap">${escapeHtml(state.lastStatusOutput)}</pre>`,
          `<button id="export-session-log" class="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg text-sm">Exportar este Log</button>`
        );
        document.getElementById('export-session-log').addEventListener('click', () =>
          downloadFile(`status-log-${new Date().toISOString()}.txt`, state.lastStatusOutput)
        );
        checkServerStatus();
        if (action === 'start' || action === 'restart') setTimeout(startLiveLogs, 2000);
      } catch (error) {
        showModal(`Error al ejecutar '${action}'`, `<p class="text-red-400">${error.message}</p>`);
      }
    })
  );

  // ---- Deep clean (danger zone) ----
  if (deepCleanBtn) {
    deepCleanBtn.addEventListener('click', async () => {
      if (!confirm('Esto detendra y eliminara el servicio y carpeta del servidor. Continuar?')) return;
      try {
        const data = await apiCall('/api/deep-clean', { connectionId: state.connectionId });
        showModal('Limpieza profunda', `<pre class="bg-black p-2 rounded text-sm whitespace-pre-wrap">${escapeHtml(data.output || 'Hecho')}</pre>`);
      } catch (error) {
        showModal('Error en limpieza', `<p class="text-red-400">${error.message}</p>`);
      }
    });
  }

  // ---- live logs ----
  function startLiveLogs() {
    stopLiveLogs();
    if (!state.connectionId) return;
    logConsole.innerHTML = '<p class="text-yellow-400">Conectando a la consola en vivo...</p>';
    state.eventSource = new EventSource(`http://localhost:3000/api/live-logs?connectionId=${state.connectionId}`);
    let initialClear = true;
    state.eventSource.onmessage = (event) => {
      if (initialClear) {
        logConsole.innerHTML = '';
        initialClear = false;
      }
      const line = document.createElement('div');
      line.textContent = event.data;
      logConsole.appendChild(line);
      logConsole.scrollTop = logConsole.scrollHeight;
    };
    state.eventSource.onerror = () => {
      const warn = document.createElement('div');
      warn.className = 'text-red-400';
      warn.textContent = '[Aviso] No se pudo leer la consola en vivo (¿servidor detenido?).';
      logConsole.appendChild(warn);
      stopLiveLogs();
    };
  }
  function stopLiveLogs() {
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }
  }

  sendCommandBtn.addEventListener('click', async () => {
    const command = commandInput.value.trim();
    if (!command) return;
    try {
      await apiCall('/api/send-command', {
        connectionId: state.connectionId,
        command,
      });
      commandInput.value = '';
    } catch (error) {
      showModal('Error', `<p class="text-red-400">${error.message}</p>`);
    }
  });
  commandPresetBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      commandInput.value = btn.dataset.command || '';
      sendCommandBtn.click();
    })
  );

  // ---- Export connection config ----
  exportConfigBtn.addEventListener('click', () => {
    if (!state.connectionId || !vpsIpInput.value || !sshUserInput.value || !state.sshKeyContent) {
      showModal('Error', '<p>No hay una conexion activa para exportar.</p>');
      return;
    }
    const cfg = { vpsIp: vpsIpInput.value, sshUser: sshUserInput.value, sshKey: state.sshKeyContent };
    downloadFile(`config-${vpsIpInput.value}.json`, JSON.stringify(cfg, null, 2));
  });

  // ---- UFW opener (auto) + OCI guide ----
  openFirewallBtn.addEventListener('click', async () => {
    const vpsIp = vpsIpInput.value.trim();
    const compartmentOcid = compartmentIdInput.value.trim();
    if (!vpsIp) return showModal('Error', '<p>Completa la IP del VPS.</p>');
    if (!compartmentOcid) return showModal('Error', '<p>Completa el OCID del Compartimento.</p>');

    // 1) Open UFW on VPS automatically (stream output)
    showModal(
      'Firewall y Red de OCI',
      `<p>Abriendo puertos 25565 TCP/UDP en UFW del VPS...</p>
       <pre id="ufw-output" class="bg-black p-2 rounded text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">...</pre>`
    );
    const out = document.getElementById('ufw-output');
    try {
      const response = await fetch('http://localhost:3000/api/open-ufw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: state.connectionId }),
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      out.textContent = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        out.textContent += decoder.decode(value, { stream: true });
        out.scrollTop = out.scrollHeight;
      }
    } catch (error) {
      out.textContent += `\nERROR: ${error.message}\n`;
    }

    // 2) Guide snippet (static)
    const ociGuide = `
  <h4 class="text-lg font-bold">Abrir Puerto 25565 en VCN / Subred (OCI)</h4>
  <ol class="list-decimal ml-6 space-y-1">
    <li>Ir a Networking → Virtual Cloud Networks → tu VCN.</li>
    <li>Security Lists → selecciona la de tu Subred pública.</li>
    <li>Añade Ingress:
      <ul class="list-disc ml-6">
        <li>Source CIDR: <code>0.0.0.0/0</code></li>
        <li>IP Protocol: TCP, Dest Port Range: <code>25565</code></li>
        <li>IP Protocol: UDP, Dest Port Range: <code>25565</code></li>
      </ul>
    </li>
  </ol>
  <p class="mt-2">Listo: el puerto 25565 queda abierto en el VPS y en la red de OCI.</p>
  `;
    document.getElementById('modal-body').innerHTML += `<div class="prose prose-invert max-w-none text-gray-300 mt-4">${ociGuide}</div>`;
  });

  // ---- Installer ----
  async function loadMinecraftVersions() {
    const type = serverTypeSelect.value;
    mcVersionSelect.innerHTML = '<option>Cargando...</option>';
    mcVersionSelect.disabled = true;
    try {
      const resp = await fetch(`http://localhost:3000/api/minecraft-versions?type=${encodeURIComponent(type)}`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.message || 'No se pudieron obtener versiones');
      mcVersionSelect.innerHTML = data.versions.map((v) => `<option value="${v}">${v}</option>`).join('');
    } catch {
      mcVersionSelect.innerHTML = '<option>Error al cargar</option>';
    } finally {
      mcVersionSelect.disabled = false;
    }
  }
  openInstallerBtn.addEventListener('click', () => {
    installerModal.classList.remove('hidden');
    loadMinecraftVersions();
  });
  serverTypeSelect.addEventListener('change', loadMinecraftVersions);
  installerCloseBtn.addEventListener('click', () => installerModal.classList.add('hidden'));

  installServerBtn.addEventListener('click', async () => {
    if (!confirm('ADVERTENCIA: Esto borrara cualquier servidor existente en el VPS. Continuar?')) return;
    installServerBtn.disabled = true;
    installerOutput.innerHTML = '<p class="text-yellow-400">Iniciando instalacion. No cierres esta ventana.</p>';

    const properties = {};
    document.querySelectorAll('#installer-form-section [id^="prop-"]').forEach((input) => {
      // Map prop-<ui-id-with-dashes>  -> server.properties key with dots
      const key = input.id.replace('prop-', '').replace(/-/g, '.');
      properties[key] = input.value;
    });

    const body = {
      connectionId: state.connectionId,
      serverType: serverTypeSelect.value,
      mcVersion: mcVersionSelect.value,
      properties,
    };

    try {
      const response = await fetch('http://localhost:3000/api/install-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      installerOutput.innerHTML = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        installerOutput.textContent += decoder.decode(value, { stream: true });
        installerOutput.scrollTop = installerOutput.scrollHeight;
      }
    } catch (error) {
      installerOutput.innerHTML += `<p class="text-red-400">Error critico: ${error.message}</p>`;
    } finally {
      installServerBtn.disabled = false;
      await checkServerStatus();
    }
  });

  exportPresetBtn.addEventListener('click', () => {
    const preset = {};
    document.querySelectorAll('#installer-form-section [id^="prop-"]').forEach((input) => {
      const key = input.id.replace('prop-', '');
      preset[key] = input.value;
    });
    preset.serverType = serverTypeSelect.value;
    preset.mcVersion = mcVersionSelect.value;
    downloadFile(`preset-${preset.serverType}-${preset.mcVersion}.json`, JSON.stringify(preset, null, 2));
  });

  importPresetBtn.addEventListener('click', () => presetFileInput.click());
  presetFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const preset = JSON.parse(ev.target.result);
        serverTypeSelect.value = preset.serverType || 'vanilla';
        await loadMinecraftVersions();
        mcVersionSelect.value = preset.mcVersion || mcVersionSelect.value;
        for (const key in preset) {
          const input = document.getElementById(`prop-${key}`);
          if (input) input.value = preset[key];
        }
      } catch {
        alert('Error al leer el archivo de preset. Es un JSON valido?');
      }
    };
    reader.readAsText(file);
  });

  // ---- server.properties editor ----
  editPropertiesBtn.addEventListener('click', async () => {
    try {
      const data = await apiCall(`/api/get-properties?connectionId=${state.connectionId}`, {}, 'GET');
      const props = data.properties || {};
      propertiesBody.innerHTML = '';

      Object.entries(props).forEach(([k, v]) => {
        const label = document.createElement('label');
        label.className = 'text-sm';
        label.setAttribute('for', `prop-${k}`);
        label.textContent = k;

        let input;
        if (v === 'true' || v === 'false') {
          input = document.createElement('select');
          input.innerHTML = '<option value="true">true</option><option value="false">false</option>';
          input.value = v;
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.value = v;
        }
        input.id = `prop-${k}`;

        const row = document.createElement('div');
        row.className = 'grid grid-cols-2 gap-2 items-center';
        row.appendChild(label);
        row.appendChild(input);
        propertiesBody.appendChild(row);
      });

      propertiesModal.classList.remove('hidden');
    } catch (error) {
      showModal('Error', `<p class="text-red-400">${error.message}</p>`);
    }
  });

  propertiesCloseBtn.addEventListener('click', () => propertiesModal.classList.add('hidden'));
  savePropertiesBtn.addEventListener('click', async () => {
    const props = {};
    propertiesBody.querySelectorAll('[id^="prop-"]').forEach((input) => {
      const key = input.id.replace('prop-', ''); // already with dots replaced by server on load
      props[key] = input.value;
    });
    try {
      await apiCall('/api/save-properties', { connectionId: state.connectionId, properties: props });
      propertiesModal.classList.add('hidden');
      showModal('Listo', '<p>server.properties guardado. Reinicia el servidor para aplicar cambios.</p>');
    } catch (error) {
      showModal('Error', `<p class="text-red-400">${error.message}</p>`);
    }
  });

  // ---- Players (ops / whitelist) ----
  async function loadPlayerLists() {
    try {
      const data = await apiCall(`/api/get-players?connectionId=${state.connectionId}`, {}, 'GET');
      const { ops, whitelist } = data;

      const renderList = (container, entries, type) => {
        container.innerHTML = '';
        if (!entries || !entries.length) {
          container.innerHTML = '<p class="text-gray-400">Lista vacia.</p>';
          return;
        }
        const ul = document.createElement('ul');
        ul.className = 'space-y-1';
        entries.forEach((e) => {
          const li = document.createElement('li');
          li.className = 'flex items-center justify-between bg-gray-900/40 rounded px-2 py-1';
          li.innerHTML = `
            <span>${escapeHtml(e.name || e.uuid || '')}</span>
            <button class="remove-btn bg-red-600 hover:bg-red-500 text-white text-xs rounded px-2 py-1">Eliminar</button>
          `;
          const btn = li.querySelector('.remove-btn');
          btn.addEventListener('click', async () => {
            try {
              await apiCall('/api/manage-player', { connectionId: state.connectionId, action: 'remove', list: type, username: e.name || e.uuid || '' });
              loadPlayerLists();
            } catch (error) {
              showModal('Error', `<p class="text-red-400">${error.message}</p>`);
            }
          });
          ul.appendChild(li);
        });
        container.appendChild(ul);
      };

      renderList(opsList, ops, 'ops');

      whitelistList.innerHTML = '';
      const wlHeader = document.createElement('div');
      wlHeader.className = 'flex items-center gap-2 mb-2';
      wlHeader.innerHTML = `
        <input id="whitelist-add-input" class="bg-gray-800 rounded px-2 py-1 text-sm w-64" placeholder="Usuario a añadir"/>
        <button id="whitelist-add-do" class="bg-green-600 hover:bg-green-500 text-white text-sm rounded px-3 py-1">Añadir</button>
      `;
      whitelistList.appendChild(wlHeader);
      const addDo = wlHeader.querySelector('#whitelist-add-do');
      const wlInput = wlHeader.querySelector('#whitelist-add-input');
      addDo.addEventListener('click', () => managePlayer('add', 'whitelist', wlInput));
      wlInput.addEventListener('keydown', (e) => e.key === 'Enter' && addDo.click());

      renderList(whitelistList, whitelist, 'whitelist');
    } catch (error) {
      showModal('Error', `<p class="text-red-400">${error.message}</p>`);
    }
  }

  managePlayersBtn.addEventListener('click', () => {
    playersModal.classList.remove('hidden');
    loadPlayerLists();
  });

  addOpBtn.addEventListener('click', async () => {
    const username = prompt('Usuario a convertir en OP:');
    if (!username) return;
    try {
      await apiCall('/api/manage-player', { connectionId: state.connectionId, action: 'add', list: 'ops', username });
      loadPlayerLists();
    } catch (error) {
      showModal('Error', `<p class="text-red-400">${error.message}</p>`);
    }
  });

  async function managePlayer(action, list, inputEl) {
    const username = (inputEl.value || '').trim();
    if (!username) return;
    try {
      await apiCall('/api/manage-player', { connectionId: state.connectionId, action, list, username });
      if (inputEl.tagName === 'INPUT') inputEl.value = '';
      loadPlayerLists();
    } catch (error) {
      showModal('Error', `<p class="text-red-400">${error.message}</p>`);
    }
  }
  playersCloseBtn.addEventListener('click', () => playersModal.classList.add('hidden'));

  // ---- Backups ----
  manageBackupsBtn.addEventListener('click', () => {
    backupsModal.classList.remove('hidden');
    backupOutput.classList.add('hidden');
    backupOutput.textContent = '';
    loadBackupsList();
  });

  async function loadBackupsList() {
    backupsList.innerHTML = '<p>Cargando lista de copias...</p>';
    try {
      let data = await apiCall('/api/backups', { connectionId: state.connectionId, action: 'list' });
      // Si el backend devolvió texto, intentar parsear
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { throw new Error('Formato de lista de copias inválido'); }
      }
      backupsList.innerHTML = '';
      if (!data.backups || !data.backups.length) {
        backupsList.innerHTML = '<p class="text-gray-400">No se encontraron copias de seguridad.</p>';
        return;
      }
      const table = document.createElement('table');
      table.className = 'w-full text-sm';
      table.innerHTML = `
        <thead>
          <tr class="text-left">
            <th class="py-1">Archivo</th>
            <th class="py-1">Fecha</th>
            <th class="py-1">Hora</th>
            <th class="py-1">Tamaño</th>
            <th class="py-1">Acciones</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      data.backups.forEach((b) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="py-1">${escapeHtml(b.name)}</td>
          <td class="py-1">${escapeHtml(b.date)}</td>
          <td class="py-1">${escapeHtml(b.time)}</td>
          <td class="py-1">${escapeHtml(b.size)}</td>
          <td class="py-1">
            <button class="restore-btn bg-blue-600 hover:bg-blue-500 text-white text-xs rounded px-2 py-1 mr-2">Restaurar</button>
            <button class="delete-btn bg-red-600 hover:bg-red-500 text-white text-xs rounded px-2 py-1">Eliminar</button>
          </td>
        `;
        const restoreBtn = tr.querySelector('.restore-btn');
        const deleteBtn = tr.querySelector('.delete-btn');
        restoreBtn.addEventListener('click', () => doBackupAction('restore', b.name));
        deleteBtn.addEventListener('click', () => doBackupAction('delete', b.name));
        tbody.appendChild(tr);
      });
      backupsList.appendChild(table);
    } catch (error) {
      backupsList.innerHTML = `<p class="text-red-400">${error.message}</p>`;
    }
  }

  createBackupBtn.addEventListener('click', () => doBackupAction('create'));
  async function doBackupAction(action, file) {
    backupOutput.classList.remove('hidden');
    backupOutput.textContent = `--- Ejecutando: ${action} ---\n`;
    try {
      if (action === 'list') return loadBackupsList();

      if (action === 'create' || action === 'restore') {
        const response = await fetch('http://localhost:3000/api/backups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: state.connectionId, action, file }),
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let partial = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          partial += decoder.decode(value, { stream: true });
          backupOutput.textContent = partial;
          backupOutput.scrollTop = backupOutput.scrollHeight;
        }
        loadBackupsList();
        checkServerStatus();
        return;
      }

      // delete
      const data = await apiCall('/api/backups', { connectionId: state.connectionId, action, file });
      backupOutput.textContent += `${(data && data.message) ? data.message : 'Hecho'}\n`;
      loadBackupsList();
    } catch (error) {
      backupOutput.textContent += `\nERROR: ${error.message}\n`;
    }
  }

  // ---- Export latest.log ----
  exportLatestLogBtn.addEventListener('click', async () => {
    try {
      const data = await apiCall(`/api/get-latest-log?connectionId=${state.connectionId}`, {}, 'GET');
      downloadFile(`latest-${new Date().toISOString()}.log`, data.logContent || '');
    } catch (error) {
      showModal('Error', `<p class="text-red-400">${error.message}</p>`);
    }
  });

  backupsCloseBtn.addEventListener('click', () => backupsModal.classList.add('hidden'));
});
