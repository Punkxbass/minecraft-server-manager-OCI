#!/bin/bash
set -e

SERVICE_PATH=/etc/systemd/system/minecraft.service

sudo tee "$SERVICE_PATH" > /dev/null <<EOF
[Unit]
Description=Minecraft Server
After=network.target

[Service]
Type=forking
User=${MC_USER}
Group=${MC_USER}
WorkingDirectory=${MC_DIR}
ExecStart=/usr/bin/screen -L -Logfile ${MC_DIR}/screen.log -dmS minecraft-console bash -c 'exec ${MC_DIR}/start.sh'
ExecStop=/usr/bin/screen -S minecraft-console -X quit
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable minecraft.service
sudo systemctl start minecraft.service

echo "Servicio systemd configurado y servidor iniciado correctamente"
