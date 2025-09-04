### **6. `guia_minecraft_manual.md` (Guía: Instalar Minecraft Manualmente)**

```markdown
# Guía: Cómo Instalar un Servidor de Minecraft Vanilla Manualmente en Ubuntu

Estos son los pasos para instalar un servidor de Minecraft Vanilla en tu VPS de Ubuntu si prefieres hacerlo tú mismo en lugar de usar las funciones automáticas.

### **Paso 1: Conectarse a la VPS por SSH**

Abre una terminal (PowerShell en Windows, Terminal en Linux/macOS) y conéctate a tu VPS. Necesitarás la IP pública de tu VPS y la ruta a tu llave privada SSH.

```powershell
# Ejemplo para Windows PowerShell:
ssh -i "C:\ruta\a\tu\llave-privada.key" ubuntu@TU_IP_PUBLICA_DEL_VPS

# Ejemplo para Linux/macOS:
ssh -i ~/.ssh/tu-llave-privada.key ubuntu@TU_IP_PUBLICA_DEL_VPS
C:\ruta\a\tu\llave-privada.key: Reemplaza esto con la ubicación real de tu archivo de llave privada (.key o .pem).

ubuntu@TU_IP_PUBLICA_DEL_VPS: El usuario por defecto en las imágenes de Ubuntu de Oracle Cloud es ubuntu. Reemplaza TU_IP_PUBLICA_DEL_VPS con la IP que obtuviste al crear tu instancia.

Paso 2: Actualizar el Sistema e Instalar Java
Es fundamental tener el sistema actualizado y la versión correcta de Java, ya que Minecraft lo requiere para funcionar.

Bash

# Actualiza la lista de paquetes e instala las actualizaciones del sistema
sudo apt update && sudo apt upgrade -y

# Instala la versión 21 de OpenJDK (recomendado para versiones recientes de Minecraft)
sudo apt install -y openjdk-21-jdk
Verifica la instalación de Java:

Bash

java -version
Deberías ver una salida que indica "OpenJDK Runtime Environment (build 21...)"

Paso 3: Crear el Directorio del Servidor
Vamos a crear una carpeta específica para el servidor de Minecraft en tu directorio de usuario.

Bash

# Crea la carpeta
mkdir ~/minecraft-server

# Navega a ella
cd ~/minecraft-server
Paso 4: Descargar el Servidor de Minecraft
Visita la página oficial de descarga de servidores de Minecraft Vanilla en tu navegador. Copia el enlace de descarga directa del archivo server.jar de la versión que desees.

Bash

# Usa wget para descargar el archivo. ¡Reemplaza la URL con la que copiaste!
wget -O server.jar "https://p.p.p/v1_4_5/server.jar" 
# Ejemplo de URL: wget -O server.jar [https://piston-data.mojang.com/v1/objects/269b61edcd120d536c4f1c1d882583a268153b3b/server.jar](https://piston-data.mojang.com/v1/objects/269b61edcd120d536c4f1c1d882583a268153b3b/server.jar)
Asegúrate de que el nombre del archivo final sea server.jar (-O server.jar).

Paso 5: Aceptar el EULA (Acuerdo de Licencia de Usuario Final)
La primera vez que ejecutas el servidor, creará un archivo eula.txt y no se iniciará hasta que aceptes el acuerdo. Lo haremos manualmente para ahorrar un paso.

Bash

echo "eula=true" > eula.txt
Paso 6: Crear un Script de Inicio para el Servidor
Crearemos un script simple para facilitar el inicio del servidor y asignarle memoria RAM.

Bash

# Abre el editor de texto Nano para crear un nuevo archivo
nano start.sh
Pega el siguiente contenido en el editor. Puedes ajustar los valores -Xms (RAM mínima) y -Xmx (RAM máxima) según la memoria de tu VPS (recuerda que tu instancia gratuita tiene 24GB disponibles).

Bash

#!/bin/bash
# Asigna 4GB de RAM inicial y 20GB como máximo al servidor de Minecraft
java -Xms4G -Xmx20G -jar server.jar nogui
Para guardar en Nano: Presiona Ctrl+X, luego Y (para confirmar guardar), y Enter (para confirmar el nombre del archivo).

Ahora, haz que el script sea ejecutable:

Bash

chmod +x start.sh
Paso 7: Opcional: Crear un Servicio Systemd (Recomendado)
Configurar el servidor como un servicio Systemd permite que se inicie automáticamente al arrancar la VPS y se gestione fácilmente con systemctl. La aplicación espera que exista este servicio.

Bash

# Abre un nuevo archivo de servicio para systemd
sudo nano /etc/systemd/system/minecraft.service
Pega el siguiente contenido. Asegúrate de reemplazar ubuntu con tu nombre de usuario SSH si es diferente.

Ini, TOML

[Unit]
Description=Minecraft Server
After=network.target

[Service]
User=ubuntu
Nice=1
WorkingDirectory=/home/ubuntu/minecraft-server
ExecStart=/usr/bin/java -Xms4G -Xmx20G -jar server.jar nogui
ExecStop=/usr/bin/screen -r minecraft -X stuff "stop\n"
KillMode=none
Restart=on-failure

[Install]
WantedBy=multi-user.target
User=ubuntu: Si usas otro usuario SSH, cámbialo aquí y en WorkingDirectory.

WorkingDirectory: Ruta a tu carpeta minecraft-server.

ExecStart: El comando para iniciar Java. Ajusta -Xms y -Xmx si lo hiciste en start.sh.

ExecStop: Este comando asume que usas screen para la consola. Si no es así, la función de detener no enviará el comando "stop" al servidor. La aplicación no utiliza screen en su lógica de logs, pero este es el método estándar para una parada limpia.

Guarda y cierra el archivo (Ctrl+X, Y, Enter).

Ahora, recarga Systemd, habilita el servicio y arráncalo:

Bash

sudo systemctl daemon-reload
sudo systemctl enable minecraft
sudo systemctl start minecraft
Verifica su estado:

Bash

sudo systemctl status minecraft
Deberías ver que está active (running).

Paso 8: ¡Conectarse al Servidor!
Tu servidor de Minecraft ya está corriendo en tu VPS. ¡Ahora puedes abrir tu juego de Minecraft y añadir un servidor usando la IP Pública de tu VPS!

Si configuraste el servicio Systemd, la aplicación podrá interactuar con él usando los botones de "Iniciar", "Detener", "Reiniciar" y "Estado".