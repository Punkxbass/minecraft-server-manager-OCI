# Guía: Cómo Instalar un Servidor de Minecraft Vanilla Manualmente en Ubuntu

Sigue estos pasos si prefieres instalar el servidor a mano en tu VPS.

## Paso 1: Conectarse a la VPS por SSH

```powershell
# Windows PowerShell
your_path_to_key="C:\ruta\a\tu\llave-privada.key"
ssh -i "$your_path_to_key" ubuntu@TU_IP_PUBLICA_DEL_VPS
```

En Linux/macOS:

```bash
ssh -i ~/.ssh/tu-llave-privada.key ubuntu@TU_IP_PUBLICA_DEL_VPS
```

## Paso 2: Actualizar el Sistema e Instalar Java

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y openjdk-21-jdk
java -version
```

## Paso 3: Crear el Directorio del Servidor

```bash
mkdir ~/minecraft-server
cd ~/minecraft-server
```

## Paso 4: Descargar el Servidor de Minecraft

Obtén la URL directa del `server.jar` desde la página oficial de Mojang y ejecuta:

```bash
wget -O server.jar "URL_DEL_SERVER_JAR"
```

## Paso 5: Aceptar el EULA

```bash
echo "eula=true" > eula.txt
```

## Paso 6: Crear un Script de Inicio

```bash
nano start.sh
```
Contenido sugerido:

```bash
#!/bin/bash
java -Xms4G -Xmx20G -jar server.jar nogui
```
Guarda y hazlo ejecutable:

```bash
chmod +x start.sh
```

## Paso 7: (Opcional) Crear un Servicio Systemd

```bash
sudo nano /etc/systemd/system/minecraft.service
```
Contenido:

```ini
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
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable minecraft
sudo systemctl start minecraft
sudo systemctl status minecraft
```

## Paso 8: ¡Conectarse!

Usa la IP pública de la VPS para unirte al servidor desde tu cliente de Minecraft.
