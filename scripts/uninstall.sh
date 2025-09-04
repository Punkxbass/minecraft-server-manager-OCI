#!/bin/bash
set -e # Detener el script si algún comando falla

echo "--- Iniciando Desinstalación Completa del Gestor de Servidores de Minecraft ---"

echo "Paso 1/6: Deteniendo y deshabilitando el servicio de Minecraft..."
if systemctl is-active --quiet minecraft.service; then
    sudo systemctl stop minecraft.service
fi
if systemctl is-enabled --quiet minecraft.service; then
    sudo systemctl disable minecraft.service
fi

echo "Paso 2/6: Eliminando el archivo de servicio de systemd..."
if [ -f "/etc/systemd/system/minecraft.service" ]; then
    sudo rm /etc/systemd/system/minecraft.service
fi
sudo systemctl daemon-reload

echo "Paso 3/6: Eliminando el usuario 'minecraft' y su directorio..."
if id "minecraft" &>/dev/null; then
    sudo deluser --remove-home minecraft
fi

echo "Paso 4/6: Eliminando los directorios de instalación..."
if [ -d "/opt/minecraft" ]; then
    sudo rm -rf /opt/minecraft
fi

echo "Paso 5/6: Eliminando las reglas de firewall de UFW..."
sudo ufw delete allow 25565/tcp || true
sudo ufw delete allow 22/tcp || true

echo "Paso 6/6: Eliminando el archivo de permisos de reinicio..."
if [ -f "/etc/sudoers.d/99-minecraft-manager-reboot" ]; then
    sudo rm /etc/sudoers.d/99-minecraft-manager-reboot
fi

echo "--- Desinstalación Completada ---"
echo "La VPS ha sido limpiada de todos los componentes de la aplicación."
echo "Los paquetes base como Java no han sido eliminados."
