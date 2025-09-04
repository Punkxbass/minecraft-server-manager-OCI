# Proyecto: OCI Minecraft Server - Visión General Técnica

## 1. Resumen del Proyecto

Este documento describe el plan de desarrollo para "OCI Minecraft Server", una aplicación web diseñada para simplificar la administración de un servidor de Minecraft alojado en una Instancia de Cómputo (VPS) de Oracle Cloud Infrastructure (OCI). El objetivo es proporcionar una interfaz gráfica centralizada que permita a un administrador controlar todos los aspectos del servidor de forma remota, desde la instalación inicial hasta la gestión diaria, sin necesidad de acceso manual constante a la terminal.

---

## 2. Arquitectura y Componentes

La aplicación se compondrá de tres archivos principales que conforman una arquitectura cliente-servidor estándar:

* **`index.html` (Frontend):** Contendrá la estructura de la interfaz de usuario (UI) y el CSS embebido para el estilo. Será la consola visual desde la cual el administrador interactuará con el sistema.
* **`script.js` (Lógica del Cliente):** Se ejecutará en el navegador del usuario. Gestionará los eventos de la UI (clics en botones, entradas de texto), enviará solicitudes al backend y actualizará la página dinámicamente con la información recibida (ej. logs del servidor, estado de los recursos).
* **`server.js` (Backend - Node.js):** Se ejecutará en el mismo VPS que el servidor de Minecraft. Actuará como intermediario, recibiendo peticiones HTTP desde el frontend, ejecutando comandos en el sistema operativo (a través de una conexión SSH segura a sí mismo o mediante `child_process`), interactuando con los archivos del servidor de Minecraft y devolviendo los resultados al cliente.

---

## 3. Estado Actual del Desarrollo

El desarrollo se encuentra en una fase de prototipado inicial. Se han generado tres versiones preliminares mediante herramientas de IA, cada una con éxitos y fracasos parciales:

* **Prototipo 1 ("Firewall"):** Su principal logro fue la implementación de código funcional para la gestión del firewall, tanto a nivel del sistema operativo (UFW) como de la infraestructura de OCI.
* **Prototipo 2 ("UI"):** Presenta la interfaz de usuario más desarrollada en términos de estructura HTML y diseño CSS, estableciendo una base visual sólida, aunque su lógica de cliente no es funcional.
* **Prototipo 3 ("Backend"):** Contiene la arquitectura de backend más robusta y mejor organizada en `server.js`, ideal para gestionar la lógica de negocio y las interacciones con el sistema.

El desafío actual es que ninguna de estas versiones integra correctamente las tres áreas (backend, frontend y funcionalidades específicas).

---

## 4. Objetivo Inmediato: Fusión y Refactorización

La siguiente fase crítica del proyecto consiste en unificar los componentes funcionales de los tres prototipos en una única base de código coherente y operativa.

El plan de acción es el siguiente:

1.  **Análisis Comparativo:** Realizar una revisión exhaustiva del código de los tres prototipos para identificar y aislar las piezas de código que implementan correctamente cada funcionalidad.
2.  **Diseño de la Arquitectura Unificada:** Definir una nueva estructura de código que utilice:
    * La **base de backend** del Prototipo 3.
    * El **diseño de interfaz** del Prototipo 2.
    * La **lógica de firewall** funcional del Prototipo 1.
    * La **lógica de frontend** del Prototipo 2, que será refactorizada para comunicarse eficazmente con el nuevo backend.
3.  **Desarrollo Iterativo:** Reconstruir los tres archivos (`server.js`, `script.js`, `index.html`) paso a paso, integrando y probando cada funcionalidad de forma aislada antes de combinarla en el producto final.

Este proceso de refactorización sentará las bases para un desarrollo estable y escalable de todas las funcionalidades descritas en la visión del proyecto.