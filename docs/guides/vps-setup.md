# Guía: Cómo Crear una Instancia (VPS) en Oracle Cloud (Septiembre 2025)

Esta guía te llevará paso a paso para crear una máquina virtual en la capa gratuita de Oracle Cloud, ideal para alojar un servidor de Minecraft.

## Paso 1: Acceder a la Creación de Instancias

1. Inicia sesión en tu cuenta de Oracle Cloud.
2. Haz clic en el menú de hamburguesa (☰) en la esquina superior izquierda.
3. Navega a **Compute** y luego selecciona **Instances**.

## Paso 2: Configurar la Instancia

Estarás en la página **Create compute instance**.

1. **Name:** asigna un nombre descriptivo, por ejemplo `servidor-minecraft`.
2. **Compartment:** asegúrate de que estás en el compartimento correcto (normalmente el raíz asociado a tu usuario).
3. **Image and shape:**
   - Haz clic en **Edit**.
   - **Image:** elige **Canonical Ubuntu** y selecciona la última versión LTS disponible (p. ej. 22.04).
   - **Shape:** selecciona **Virtual Machine**, luego la serie **Ampere**, marca **Always Free eligible** y elige `VM.Standard.A1.Flex`.
   - **OCPU y Memoria:** asigna hasta 4 OCPUs y 24 GB de memoria (límite de la capa gratuita).
   - Haz clic en **Select shape**.
4. **Networking:**
   - Deja **Create new virtual cloud network** y **Create new public subnet** si es tu primera vez.
   - Asegúrate de que **Assign a public IPv4 address** esté en **Yes** para obtener una IP pública.
5. **Add SSH keys:**
   - Selecciona **Generate a key pair for me**.
   - Descarga y guarda la clave privada (`.key`) y la pública.
6. **Boot volume:** mantiene la configuración por defecto (50 GB).
7. Haz clic en **Create**.

La instancia tardará unos minutos en aprovisionarse. Cuando el estado aparezca en verde (Running), haz clic en el nombre de la instancia para ver su **IP pública** y otros detalles.
