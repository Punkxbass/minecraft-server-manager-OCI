# Gestor Web de Servidor de Minecraft en OCI

## Resumen
Se consolidaron tres prototipos en una única base de código funcional compuesta por `index.html`, `script.js` y `server.js`. Esta herramienta permite administrar de forma remota un servidor de Minecraft alojado en Oracle Cloud Infrastructure.

## ¿Qué se hizo y cómo?
- Se integró la estructura robusta del backend de la Versión 3 con la gestión de firewall de la Versión 1 y la interfaz gráfica de la Versión 2.
- `server.js` unifica la conexión SSH, la instalación del servidor, el control del servicio, la apertura de puertos en UFW y en las listas de seguridad de OCI, la administración de jugadores, la gestión de copias de seguridad y la consulta de guías Markdown.
- `script.js` coordina la interacción del usuario con el backend: establece la conexión, muestra logs en vivo, ejecuta comandos, controla el servidor y gestiona jugadores y backups.
- `index.html` ofrece una interfaz basada en Tailwind con modales para editar propiedades, manejar jugadores y gestionar copias de seguridad, además de una consola de logs y comandos.

## Resultados esperados
La aplicación permite:
- Instalar y configurar diferentes versiones del servidor de Minecraft desde la web.
- Controlar el servicio (iniciar, detener, reiniciar) y ver registros en tiempo real.
- Abrir puertos automáticamente tanto en UFW como en las listas de seguridad de OCI.
- Administrar operadores y whitelist sin acceder manualmente al servidor.
- Crear, restaurar y eliminar copias de seguridad del mundo.
Todo ello mediante una conexión SSH segura establecida por el backend.

## Funcionamiento de la interfaz y del proyecto
1. **Pantalla de inicio**: solicita datos SSH y los guarda como preset para reconexiones futuras.
2. **Panel principal**: al conectarse se habilitan los botones de instalación, control del servidor, firewall y utilidades.
3. **Consola de logs y comandos**: muestra el log en vivo del servidor y permite enviar comandos directamente.
4. **Modales de administración**:
   - *server.properties*: edición y guardado remoto.
   - *Jugadores*: alta y baja en operadores y whitelist.
   - *Backups*: listado, creación, restauración y eliminación de copias.
5. **Guías Markdown**: botones de ayuda que cargan documentos alojados en el VPS para asistencia.

El backend expone una API REST que procesa cada una de estas acciones, se comunica con el servidor mediante SSH y responde en formato JSON.

## Ejecución
Con Node.js instalado en la máquina donde reside `server.js`:

```bash
node server.js
```

Luego abrir `index.html` en un navegador y utilizar la interfaz.
