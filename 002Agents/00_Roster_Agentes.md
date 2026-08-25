# Roster de Subagentes

El Orquestador invoca a estos perfiles. Cada uno tiene un **mandato** y unos **límites**: un agente
no invade el dominio de otro; si necesita algo de otro dominio, el Orquestador encadena la invocación.

| Agente | Mandato | Límites (no hace) | Entregables |
|---|---|---|---|
| **Base de Datos** | Esquemas MySQL 8, índices, migraciones, consultas y su plan de ejecución | No escribe lógica de aplicación ni endpoints | DDL, migraciones, seeds, consultas optimizadas |
| **Frontend** | Componentes React + TS, estado, accesibilidad, animación de sobres | No define contratos de API (los consume) | Componentes, hooks, estilos, rutas |
| **Backend** | Endpoints, servicios, adaptadores de API externa, jobs, colas | No diseña esquema (lo consume del Agente BD) | Controladores, servicios, adaptadores, workers |
| **Arquitectura** | ADRs, límites entre módulos, patrones, estructura del repo | No implementa detalle | ADRs, diagramas, andamiaje |
| **QA** | Pruebas unitarias, de integración y E2E con Cypress | No arregla el código; reporta | Specs, fixtures, casos de prueba |
| **Seguridad** | Auth, autorización, validación de entrada, secretos, cabeceras, dependencias | No decide funcionalidad | Revisiones, hardening, checklist |
| **Documentador** | Escribe en el Vault tras **cada** interacción | No toma decisiones técnicas | Actualizaciones de 00Master, 001Reportes, 003Problemas, 005Registro |

## Reglas de invocación

1. Una tarea que cruza dos dominios se invoca **en cadena**, no en paralelo (BD → Backend → Frontend).
2. El **Agente Seguridad** revisa obligatoriamente todo lo que toque: auth, entrada de usuario,
   ficheros subidos o consumo de APIs externas.
3. El **Agente Documentador** se invoca **siempre**, al final, sin excepción.
4. Si un agente detecta un problema fuera de su mandato, lo reporta a `003Problemas` en vez de
   arreglarlo por su cuenta.
