#!/bin/bash
# install.sh - Script de instalación idempotente para el servicio de Minecraft
set -e

# Variables de configuración
MINECRAFT_USER="minecraft"
MINECRAFT_GROUP="minecraft"
SERVER_DIR="/opt/minecraft/server"

echo "Paso 1/6: Creando usuario y grupo..."
if id -u "$MINECRAFT_USER" &>/dev/null; then
    echo "El usuario $MINECRAFT_USER ya existe."
else
    useradd -r -m -U -d /opt/minecraft "$MINECRAFT_USER"
    echo "Usuario $MINECRAFT_USER creado."
fi

echo "Paso 2/6: Creando directorio del servidor..."
if [ -d "$SERVER_DIR" ]; then
    echo "El directorio $SERVER_DIR ya existe."
else
    mkdir -p "$SERVER_DIR"
    chown "$MINECRAFT_USER":"$MINECRAFT_GROUP" "$SERVER_DIR"
    echo "Directorio $SERVER_DIR creado."
fi

echo "Paso 3/6: Configurando permisos del directorio..."
chown -R "$MINECRAFT_USER":"$MINECRAFT_GROUP" "$SERVER_DIR"

echo "Paso 4/6: Verificando presencia de Java (requiere OpenJDK)..."
if ! command -v java &>/dev/null; then
    echo "Java no está instalado. Instálalo manualmente antes de continuar."
    exit 1
fi

echo "Paso 5/6: Creando servicio de systemd..."
if [ ! -f "scripts/minecraft.service.template" ]; then
    echo "No se encontró la plantilla del servicio: scripts/minecraft.service.template"
    exit 1
fi

sed -e "s/{{USER}}/${MINECRAFT_USER}/g" \
    -e "s|{{WORKING_DIR}}|${SERVER_DIR}|g" \
    scripts/minecraft.service.template > /etc/systemd/system/minecraft.service

echo "Recargando el daemon de systemd..."
systemctl daemon-reload

echo "Habilitando el servicio minecraft para el inicio automático..."
systemctl enable minecraft.service

echo "Iniciando el servicio minecraft..."
systemctl start minecraft.service

echo "Instalación del servicio completada. Estado del servicio:"
systemctl status minecraft.service --no-pager
