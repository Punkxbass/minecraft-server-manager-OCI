#!/bin/bash
# installer.sh - Robust and idempotent Minecraft systemd service setup
# This script creates or updates the minecraft.service unit file and ensures
# it is correctly enabled and started. It can be safely re-run without side
# effects.

set -euo pipefail

SERVICE_NAME="minecraft.service"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"

# Configuration variables with defaults. These can be overridden via the
# environment before running this script.
JAR_NAME="${JAR_NAME:-server.jar}"
MIN_RAM="${MIN_RAM:-1G}"
MAX_RAM="${MAX_RAM:-1G}"
MC_USER="${MC_USER:-ubuntu}"
MC_GROUP="${MC_GROUP:-$MC_USER}"
MC_DIR="${MC_DIR:-/home/$MC_USER/minecraft-server}"

create_or_update_service() {
  echo "Paso 6/6: Creando servicio de systemd..."

  # If the service is already running, stop it so we can update the unit file
  # without interfering with the current process. This makes the script
  # idempotent when executed multiple times.
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "Detectado servicio existente. Deteniendo para actualizar..."
    sudo systemctl stop "$SERVICE_NAME"
  fi

  echo "Creando/Actualizando archivo de unidad systemd..."
  sudo tee "$SERVICE_FILE" > /dev/null <<EOF_SERVICE
[Unit]
Description=Minecraft Server
After=network.target

[Service]
User=$MC_USER
Group=$MC_GROUP
WorkingDirectory=$MC_DIR
ExecStart=/usr/bin/java -Xmx$MAX_RAM -Xms$MIN_RAM -jar $MC_DIR/$JAR_NAME nogui
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF_SERVICE

  # Ensure the service file has the correct ownership and permissions
  sudo chown root:root "$SERVICE_FILE"
  sudo chmod 644 "$SERVICE_FILE"

  echo "Recargando el daemon de systemd..."
  sudo systemctl daemon-reload

  # Enable the service only if it's not already enabled to avoid unnecessary
  # operations on subsequent runs.
  if systemctl is-enabled --quiet "$SERVICE_NAME"; then
    echo "El servicio minecraft ya está habilitado."
  else
    echo "Habilitando el servicio minecraft para el inicio automático..."
    sudo systemctl enable "$SERVICE_NAME"
  fi

  echo "Iniciando el servicio minecraft..."
  sudo systemctl start "$SERVICE_NAME"
}

create_or_update_service
