const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const app = express();
const port = 3000;
const execAsync = promisify(exec);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Esta línea sirve todos tus archivos (Index.html, script.js, style.css)
app.use(express.static(path.join(__dirname)));

// Endpoint para abrir el firewall en OCI
app.post('/api/open-oci-firewall', async (req, res) => {
    const { compartmentId, vcnId } = req.body;
    console.log('Solicitud recibida para abrir el firewall de OCI.');
    console.log(`Compartment ID: ${compartmentId}`);
    console.log(`VCN ID: ${vcnId}`);

    if (!compartmentId || !vcnId) {
        return res.status(400).json({ success: false, message: 'Error: El OCID del Compartimento y el OCID de la VCN son obligatorios.' });
    }

    try {
        // --- LÓGICA MEJORADA Y MÁS ROBUSTA ---
        // 1. Obtener TODAS las listas de seguridad como JSON, evitando filtros complejos en la terminal.
        console.log('Paso 1: Obteniendo listas de seguridad (método robusto)...');
        const listCommand = `oci network security-list list --compartment-id "${compartmentId}" --vcn-id "${vcnId}" --all`;
        console.log(`Ejecutando comando: ${listCommand}`);
        
        const { stdout: listJson, stderr: listErr } = await execAsync(listCommand);

        if (listErr) {
            console.error('Error al ejecutar el comando para listar las security lists:', listErr);
            return res.status(500).json({ success: false, message: 'Error al comunicarse con OCI para listar las redes.', error: listErr });
        }

        const securityLists = JSON.parse(listJson).data;
        console.log(`Se encontraron ${securityLists.length} listas de seguridad.`);

        // 2. Buscar la lista de seguridad por defecto en JavaScript.
        const vcnName = path.basename(vcnId); // Usado para construir los nombres a buscar
        const defaultSecurityList = securityLists.find(list => 
            list['display-name'] === `Default Security List for ${vcnName}` ||
            list['display-name'] === `Lista de seguridad por defecto para ${vcnName}`
        );

        if (!defaultSecurityList) {
            console.error('Error definitivo: No se pudo encontrar una lista de seguridad por defecto para la VCN proporcionada.');
            return res.status(404).json({ success: false, message: `No se pudo encontrar una lista de seguridad por defecto para la VCN ${vcnId}. Verifica los OCIDs o si el nombre de la lista fue cambiado.` });
        }

        const finalSecurityListId = defaultSecurityList.id;
        console.log(`Paso 2: Lista de seguridad encontrada con ID: ${finalSecurityListId}`);

        // 3. Obtener las reglas de ingreso actuales (la lista ya las incluye).
        let existingRules = defaultSecurityList['ingress-security-rules'];
        console.log(`Paso 3: Se encontraron ${existingRules.length} reglas de ingreso existentes.`);

        // 4. Comprobar si las reglas para Minecraft ya existen
        const tcpRuleExists = existingRules.some(rule => rule.protocol === '6' && rule.tcpOptions?.destinationPortRange?.min === 25565);
        const udpRuleExists = existingRules.some(rule => rule.protocol === '17' && rule.udpOptions?.destinationPortRange?.min === 25565);

        if (tcpRuleExists && udpRuleExists) {
            console.log('Las reglas para el puerto 25565 (TCP y UDP) ya existen. No se requieren cambios.');
            return res.json({ success: true, message: 'El firewall de OCI ya está configurado correctamente para Minecraft (Puerto 25565 TCP/UDP).' });
        }
        
        // 5. Añadir las nuevas reglas si no existen
        if (!tcpRuleExists) {
            console.log('Añadiendo regla para TCP puerto 25565...');
            existingRules.push({
                description: "Minecraft Server (TCP)",
                protocol: "6", // TCP
                source: "0.0.0.0/0",
                isStateless: false,
                tcpOptions: { destinationPortRange: { min: 25565, max: 25565 } }
            });
        }
        if (!udpRuleExists) {
             console.log('Añadiendo regla para UDP puerto 25565...');
            existingRules.push({
                description: "Minecraft Server (UDP)",
                protocol: "17", // UDP
                source: "0.0.0.0/0",
                isStateless: false,
                udpOptions: { destinationPortRange: { min: 25565, max: 25565 } }
            });
        }

        // 6. Escribir el conjunto de reglas actualizado a un archivo temporal
        const tempFilePath = path.join(os.tmpdir(), `oci-rules-${Date.now()}.json`);
        await fs.writeFile(tempFilePath, JSON.stringify(existingRules, null, 2));
        console.log(`Paso 4: Archivo de reglas temporales creado en ${tempFilePath}`);

        // 7. Ejecutar el comando de actualización
        console.log('Paso 5: Aplicando las reglas actualizadas en la lista de seguridad...');
        const updateCommand = `oci network security-list update --security-list-id "${finalSecurityListId}" --ingress-security-rules file://${tempFilePath} --force`;
        console.log(`Ejecutando comando: ${updateCommand}`);
        
        const { stderr: updateErr } = await execAsync(updateCommand);
        
        await fs.unlink(tempFilePath); // Limpiar el archivo temporal

        if (updateErr) {
             console.error('Error al actualizar la lista de seguridad:', updateErr);
            if (updateErr.includes("NotAuthenticated") || updateErr.includes("Authorization failed")) {
                return res.status(401).json({ success: false, message: 'Error de autenticación con OCI. Verifica tu archivo de configuración (API Key, fingerprint, etc.).', error: updateErr });
            }
            return res.status(500).json({ success: false, message: 'Error al aplicar las nuevas reglas de firewall.', error: updateErr });
        }

        console.log('¡Éxito! El firewall de OCI ha sido actualizado correctamente.');
        res.json({ success: true, message: '¡Firewall de OCI actualizado con éxito! Se han añadido las reglas para el puerto 25565 (TCP/UDP).' });

    } catch (error) {
        console.error('Ha ocurrido un error inesperado en el proceso:', error);
        const errorMessage = error.stderr || error.message;
        if (errorMessage.includes("NotAuthenticated") || errorMessage.includes("Authorization failed")) {
             return res.status(401).json({ success: false, message: 'Error de autenticación con OCI. Verifique la configuración de OCI CLI (config file, API keys, permisos).', error: errorMessage });
        }
        if (errorMessage.includes("NotFound")) {
             return res.status(404).json({ success: false, message: 'No se encontró un recurso. Verifique que los OCIDs (Compartimento, VCN) son correctos y el usuario tiene permiso para verlos.', error: errorMessage });
        }
        res.status(500).json({ success: false, message: 'Ocurrió un error en el servidor al intentar abrir el firewall.', error: errorMessage });
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});