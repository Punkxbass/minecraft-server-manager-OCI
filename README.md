# Gestor de Servidores de Minecraft para OCI
![Estado de la Construcción](...)[![Licencia](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
> Un gestor web seguro para servidores de Minecraft en Oracle Cloud Infrastructure (OCI). Automatiza la instalación, la configuración del servicio systemd, las reglas de firewall (UFW y OCI), y las copias de seguridad a través de un backend en Node.js. Incluye streaming de logs en vivo, gestión de jugadores y un enfoque en las mejores prácticas de seguridad.
> 
## ✨ Características
 * Instalación Automatizada: Despliega servidores de Minecraft (Vanilla, Paper, Fabric) con un solo clic.
 * Gestión de Servicios: Inicia, detiene, reinicia y comprueba el estado del servidor a través de un servicio systemd robusto.
 * Logs en Vivo: Visualiza la consola del servidor en tiempo real directamente en la interfaz web.
 * Gestión de Firewall: Automatiza la configuración de reglas de firewall tanto en la VPS (UFW) como en las Listas de Seguridad de OCI.
 * Copias de Seguridad: Crea y gestiona copias de seguridad del mundo del servidor.
 * Gestión de Jugadores: Administra la lista blanca (whitelist) y baneos de jugadores.
 * Explorador de Archivos: Navega, descarga y gestiona archivos del VPS directamente desde la interfaz.
* Interfaz Web Intuitiva: Controla todos los aspectos de tu servidor desde una interfaz web moderna y fácil de usar.
## 🗂️ Estructura del Proyecto
```
minecraft-server-manager-OCI/
├── config/
│   └── .env.example
├── docs/
│   ├── guides/
│   └── api/
├── scripts/
│   ├── install/
│   ├── maintenance/
│   └── bash/
├── src/
│   ├── secureCommands.js
│   ├── server.js
│   └── public/
│       ├── index.html
│       ├── script.js
│       └── styles/
└── PENDIENTES.md
```
## 📸 Capturas de Pantalla
(Aquí se pueden añadir imágenes de la interfaz web)
## 🗺️ Diagrama de Arquitectura
(Agregar diagrama representando la comunicación entre frontend, backend y VPS)
## 🚀 Cómo Empezar
Sigue estos pasos para poner en marcha el gestor en tu propia infraestructura de OCI.
### Requisitos Previos
 * Una cuenta en Oracle Cloud Infrastructure (OCI).
 * Una instancia de cómputo (VPS) con Ubuntu 22.04 o superior.
 * Node.js (v18 o superior) y npm instalados en la máquina donde se ejecutará el backend.
 * Credenciales de la API de OCI configuradas para la gestión de las Listas de Seguridad.
### Instalación
 * **Clonar el Repositorio:**
```bash
git clone https://github.com/Punkxbass/minecraft-server-manager-OCI.git
cd minecraft-server-manager-OCI
```
 * Configurar el Backend:
   * Instala las dependencias: `npm install`.
   * Crea un archivo `.env` a partir de `.env.example` y rellena las variables de entorno, incluyendo las credenciales de OCI y los detalles de conexión SSH a tu VPS.
 * Ejecutar el Backend:
```bash
npm start
```
 * Preparar la VPS:
   * Asegúrate de que tu VPS de OCI permite conexiones SSH desde la IP donde se ejecuta el backend.
   * Copia el script `install.sh` a tu VPS.
   * Ejecuta el script de instalación en la VPS con privilegios de superusuario:
```bash
chmod +x install.sh
sudo ./install.sh
```
   El script instalará Java, creará el usuario `minecraft`, configurará el servicio systemd y preparará el entorno.
## 🕹️ Uso
Una vez que el backend esté en funcionamiento y la VPS preparada, accede a la interfaz web (por defecto en http://localhost:3000). Desde allí podrás:
 * Instalar un nuevo servidor de Minecraft.
 * Controlar el estado del servicio.
 * Ver los logs en tiempo real.
 * Gestionar otras funcionalidades a través de los menús correspondientes.
## 🛠️ Troubleshooting
* Verifica que las claves SSH tengan permisos correctos.
* Revisa los logs descargables si el servidor no responde.
* Asegúrate de que los puertos 22 y 25565 estén abiertos en OCI y en UFW.
## ❓ FAQ
**¿Puedo usar otro proveedor que no sea OCI?**
Sí, siempre que tengas acceso SSH al servidor Linux.

**¿Dónde se guardan los logs descargados?**
En el directorio de descargas configurado en tu navegador.
## 🔒 Consideraciones de Seguridad
¡IMPORTANTE! Este proyecto proporciona un control administrativo completo sobre un servidor remoto. Exponer la interfaz web directamente a Internet sin las debidas precauciones es extremadamente arriesgado.
 * Acceso Restringido: Se recomienda encarecidamente NO exponer el puerto del backend a la Internet pública. Accede a la interfaz web a través de una VPN, un túnel SSH o, como mínimo, restringe el acceso a tu dirección IP estática en el firewall.
 * Principio de Privilegio Mínimo: El backend se conecta a la VPS vía SSH. Utiliza una clave SSH dedicada para esta aplicación y considera restringir los comandos que esta clave puede ejecutar en el archivo `authorized_keys` del servidor.
 * HTTPS: Si decides exponer la aplicación, asegúrate de configurarla detrás de un proxy inverso (como Nginx) y forzar el uso de HTTPS con certificados SSL/TLS válidos (por ejemplo, de Let's Encrypt).
 * Auditorías Regulares: Mantén las dependencias del proyecto actualizadas ejecutando `npm audit` periódicamente.
## 🤝 Cómo Contribuir
¡Las contribuciones son bienvenidas! Si deseas mejorar el proyecto, por favor, sigue estos pasos:
 * Haz un fork del repositorio.
 * Crea una nueva rama para tu característica (`git checkout -b feature/AmazingFeature`).
 * Realiza tus cambios y haz commit (`git commit -m 'Add some AmazingFeature'`).
 * Empuja tus cambios a la rama (`git push origin feature/AmazingFeature`).
 * Abre un Pull Request.
Por favor, consulta `CONTRIBUTING.md` para más detalles.
## 📄 Licencia
Este proyecto está distribuido bajo la Licencia MIT. Consulta el archivo `LICENSE` para más información.
