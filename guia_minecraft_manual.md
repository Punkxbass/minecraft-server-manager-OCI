# Instalar un servidor de Minecraft manualmente

1. Conéctate por SSH a tu VPS.
2. Instala Java 21: `sudo apt-get update && sudo apt-get install -y openjdk-21-jdk`.
3. Descarga el servidor (ej. PaperMC): `wget https://api.papermc.io/v2/projects/paper/.../server.jar`.
4. Acepta el EULA (`echo eula=true > eula.txt`) y configura `server.properties`.
5. Abre el puerto 25565 en UFW y en la lista de seguridad de OCI.
6. Ejecuta el servidor con `java -Xms1G -Xmx2G -jar server.jar nogui`.
