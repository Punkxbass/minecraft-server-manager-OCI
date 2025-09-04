# Guía: Cómo Configurar la OCI CLI Correctamente

La OCI CLI (Interfaz de Línea de Comandos) es una herramienta poderosa para automatizar tareas en Oracle Cloud. Esta guía está orientada a Windows.

## Paso 1: Instalar la OCI CLI (Windows)

Abre **PowerShell como Administrador** y ejecuta:

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force;
Invoke-WebRequest -Uri https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.ps1 -OutFile install.ps1;
.\install.ps1
```
Presiona Enter para aceptar la ubicación por defecto y permitir que el instalador actualice el PATH. Omite la generación del archivo `config`.

## Paso 2: Verificar la Instalación y el PATH

Cierra y vuelve a abrir PowerShell (modo normal) y comprueba:

```powershell
oci --version
```
Si obtienes un error de comando no reconocido, añade manualmente al PATH:

1. Abre **Editar las variables de entorno del sistema**.
2. En "Variables de usuario", edita `Path` y agrega:
   `C:\Users\<tu-usuario>\lib\oracle-cli\Scripts`
3. Guarda y abre una nueva ventana de PowerShell para repetir `oci --version`.

## Paso 3: Generar un Par de Claves API

```powershell
mkdir ~/.oci
cd ~/.oci
openssl genrsa -out oci_api_key.pem 2048
openssl rsa -pubout -in oci_api_key.pem -out oci_api_key_public.pem
```

## Paso 4: Subir la Clave Pública a Oracle Cloud

1. Inicia sesión en la consola de Oracle Cloud.
2. Ve a **Profile → My Profile → API Keys**.
3. Haz clic en **Add API Key** → **Paste Public Key**.
4. Pega el contenido de `oci_api_key_public.pem` y guarda.
5. Copia la "Configuration File Preview" que aparece.

## Paso 5: Crear y Corregir el Archivo `config`

1. En `C:\Users\<tu-usuario>\.oci\` crea el archivo `config`.
2. Pega el contenido de la vista previa anterior.
3. Corrige la línea `key_file` para que use la ruta absoluta:
   ```
   key_file=C:\\Users\\<tu-usuario>\\.oci\\oci_api_key.pem
   ```

## Paso 6: Obtener el OCID del Compartimento (Tenancy)

En la consola, desde el menú de perfil, haz clic en el nombre de tu Tenancy y copia su OCID; será necesario para abrir el firewall desde la aplicación.

¡La OCI CLI ya está lista para usarse!
