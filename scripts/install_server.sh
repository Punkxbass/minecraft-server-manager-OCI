#!/bin/bash
set -e

JAR_NAME="server.jar"

echo "--- Iniciando Instalación (Tipo: $SERVER_TYPE, Versión: $MC_VERSION) ---"
echo "Paso 1: Limpiando instalación anterior..."
sudo systemctl stop minecraft &>/dev/null || echo "Info: Servicio no activo."
sudo systemctl disable minecraft &>/dev/null || echo "Info: Servicio no habilitado."
sudo rm -f /etc/systemd/system/minecraft.service
sudo systemctl daemon-reload
sudo systemctl reset-failed
rm -rf "$SERVER_DIR"
mkdir -p "$SERVER_DIR"
cd "$SERVER_DIR"
echo "Limpieza completada."

echo "Paso 2: Instalando dependencias (Java 21, wget, jq, screen, ufw)..."
sudo apt-get update > /dev/null
sudo apt-get install -y openjdk-21-jdk wget jq screen ufw > /dev/null
echo "Dependencias instaladas."

echo "Paso 2.5: Configurando firewall del sistema operativo (UFW)..."
sudo ufw allow 22/tcp
sudo ufw allow 25565/tcp
sudo ufw allow 25565/udp
sudo ufw --force enable
echo "Firewall del sistema operativo configurado y activado."

echo "Paso 3: Descargando archivos del servidor..."
if [ "$SERVER_TYPE" = "vanilla" ]; then
  MANIFEST_URL=$(curl -s https://piston-meta.mojang.com/mc/game/version_manifest_v2.json | jq -r --arg VER "$MC_VERSION" '.versions[] | select(.id == $VER) | .url')
  DOWNLOAD_URL=$(curl -s "$MANIFEST_URL" | jq -r '.downloads.server.url')
  wget -q --show-progress -O server.jar "$DOWNLOAD_URL"
elif [ "$SERVER_TYPE" = "paper" ]; then
  BUILD=$(curl -s https://api.papermc.io/v2/projects/paper/versions/"$MC_VERSION"/builds | jq -r '.builds[-1].build')
  DOWNLOAD_URL="https://api.papermc.io/v2/projects/paper/versions/$MC_VERSION/builds/$BUILD/downloads/paper-$MC_VERSION-$BUILD.jar"
  wget -q --show-progress -O server.jar "$DOWNLOAD_URL"
elif [ "$SERVER_TYPE" = "fabric" ]; then
  FABRIC_INSTALLER_URL=$(curl -s "https://meta.fabricmc.net/v2/versions/installer" | jq -r '.[0].url')
  wget -q --show-progress -O fabric-installer.jar "$FABRIC_INSTALLER_URL"
  java -jar fabric-installer.jar server -mcversion "$MC_VERSION" -downloadMinecraft
  JAR_NAME="fabric-server-launch.jar"
fi
echo "Descarga completada."

echo "Paso 4: Configurando archivos del servidor..."
echo "eula=true" > eula.txt
echo "$PROPERTIES_B64" | base64 -d > server.properties
echo "enable-rcon=false" >> server.properties

echo "Paso 5: Creando script de inicio (start.sh)..."
cat > start.sh <<_SCRIPT
#!/bin/bash
java -Xms4G -Xmx20G -jar $JAR_NAME nogui
_SCRIPT
chmod +x start.sh

echo "Paso 6: Creando servicio de systemd con screen..."
sudo tee /etc/systemd/system/minecraft.service > /dev/null <<_SERVICE
[Unit]
Description=Minecraft Server ($SERVER_TYPE $MC_VERSION)
After=network.target
[Service]
User=$SSH_USER
Nice=1
KillMode=none
SuccessExitStatus=0 1
WorkingDirectory=$SERVER_DIR
ExecStart=/usr/bin/screen -L -Logfile $SERVER_DIR/console.log -S minecraft -d -m /bin/bash $SERVER_DIR/start.sh
ExecStop=/usr/bin/screen -p 0 -S minecraft -X eval "stuff \"stop\\015\""
[Install]
WantedBy=multi-user.target
_SERVICE

sudo systemctl daemon-reload
sudo systemctl enable minecraft
echo "Servicio creado y habilitado."
echo "--- Instalación Finalizada ---"
