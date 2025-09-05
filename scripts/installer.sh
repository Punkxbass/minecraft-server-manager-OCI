#!/bin/bash
set -e

SERVICE_PATH=/etc/systemd/system/minecraft.service

sudo tee "$SERVICE_PATH" > /dev/null <<EOL
[Unit]
Description=Minecraft Server
Wants=network-online.target
After=network-online.target

[Service]
User=$MC_USER
Group=$MC_USER
WorkingDirectory=$MC_DIR
ExecStart=/usr/bin/screen -S minecraft-console -d -m /usr/bin/java -Xmx$MAX_RAM -Xms$MIN_RAM -jar $JAR_NAME nogui
Restart=on-failure
RestartSec=30s
StandardInput=null

[Install]
WantedBy=multi-user.target
EOL

echo "Verificando la sintaxis del archivo de servicio generado..."
sudo systemd-analyze verify "$SERVICE_PATH"
if [ $? -ne 0 ]; then
    echo " El archivo de servicio generado ($SERVICE_PATH) tiene un error de sintaxis."
    echo "--- Contenido del archivo defectuoso ---"
    cat "$SERVICE_PATH"
    echo "------------------------------------"
    exit 1
fi

sudo systemctl daemon-reload
sudo systemctl restart minecraft.service
sudo systemctl enable minecraft.service
