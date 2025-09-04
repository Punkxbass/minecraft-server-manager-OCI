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

1.  **Pantalla de inicio**: solicita datos SSH y los guarda como preset para reconexiones futuras.
2.  **Panel principal**: al conectarse se habilitan los botones de instalación, control del servidor, firewall y utilidades.
3.  **Consola de logs y comandos**: muestra el log en vivo del servidor y permite enviar comandos directamente.
4.  **Modales de administración**:
      - *server.properties*: edición y guardado remoto.
      - *Jugadores*: alta y baja en operadores y whitelist.
      - *Backups*: listado, creación, restauración y eliminación de copias.
5.  **Guías Markdown**: botones de ayuda que cargan documentos alojados en el VPS para asistencia.

El backend expone una API REST que procesa cada una de estas acciones, se comunica con el servidor mediante SSH y responde en formato JSON.

## Ejecución

### Requisitos

- Node.js \>= 18
- npm

### Instalación de dependencias

```bash
npm install
```

### Inicio rápido

```bash
npm start
```

El servidor Express quedará escuchando en `http://localhost:3000`. Abre `index.html` en tu navegador para usar la interfaz.

### Permiso para reiniciar la VPS

Para que el botón **Reiniciar VPS** funcione, el usuario que ejecuta la aplicación debe tener permisos para ejecutar `/sbin/reboot` sin contraseña. Añade un archivo en `/etc/sudoers.d/` con la siguiente línea (sustituye `ubuntu` por tu usuario si es distinto):

```bash
ubuntu ALL=(ALL) NOPASSWD: /sbin/reboot
```

### Instalación desde cero en Windows

1. Instala [Git](https://git-scm.com/download/win) y [Node.js](https://nodejs.org/) (incluye npm).
2. Abre **PowerShell** y clona el repositorio:
   ```powershell
   git clone https://github.com/Punkxbass/minecraft-server-manager-OCI.git
   cd minecraft-server-manager-OCI
   ```
3. Instala las dependencias:
   ```powershell
   npm install
   ```
4. Inicia el backend:
   ```powershell
   npm start
   ```
5. Abre `index.html` con tu navegador (doble clic o arrastrándolo a una pestaña). La aplicación se conectará al backend en `http://localhost:3000`.


### Ejecutar desde GitHub

La interfaz web (`index.html` y `script.js`) puede publicarse en **GitHub Pages** para probarla sin descarga local. Para ejecutar el backend se recomienda usar **GitHub Codespaces** o un contenedor remoto donde se ejecute `npm start`.

## Manual rápido de funciones

- **Instalación automática:** soporta servidores *Vanilla*, *Paper* y *Fabric*. Al elegir Fabric aparece un botón con una guía para instalar mods.
- **Consola de logs en vivo:** muestra la salida real del proceso de `screen`. Desde la misma vista se pueden exportar `latest.log` o el `screen.log` y abrir una consola interactiva.
- **Consola interactiva:** botón "Abrir consola" abre una ventana con comandos comunes y opción para exportar el log de `screen` sin salir.
- **Gestión completa:** control del servicio, edición de `server.properties`, administración de jugadores, backups, y apertura de firewall en VPS y OCI.