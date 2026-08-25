# S001 — Inicialización del Vault
**Fecha:** 2026-08-25 · **Duración:** 1 interacción · **Orquestador:** Claude.md

## Requerimiento del usuario
Establecer el modelo de trabajo "Vault" e inicializar `00Master`, `004Arquitectura` y `001Reportes`
para un simulador de sobres + constructor de mazos de MTG / Yu-Gi-Oh! / Pokémon TCG
(React + Node.js|Laravel + MySQL) consumiendo Scryfall, YGOPRODeck y Pokémon TCG API.

## Agentes invocados
1. **Agente Arquitectura** — alcance del producto, ADR-001 a ADR-005, flujos de datos, infraestructura.
2. **Agente Base de Datos** — modelo unificado de 11 entidades con estrategia común/JSON por juego.
3. **Agente Backend** — verificación en vivo de las 3 APIs y diseño de la capa de rate limiting.
4. **Agente Documentador** — redacción de los 16 documentos del Vault.

## Hallazgos de la verificación en vivo (2026-08-25)
- `GET api.scryfall.com/sets/dsk` → **200 OK**. Bulk data disponible en `/bulk-data`.
- `GET api.pokemontcg.io/v2/sets` → **200 OK sin API key** (174 sets), cuota diaria reducida.
- YGOPRODeck v7: 20 req/s, bloqueo de 1 h al exceder, **prohibido el hotlinking de imágenes**.

## Decisiones tomadas
| ID | Decisión | Estado |
|---|---|---|
| ADR-001 | Runtime del backend | 🔴 **ABIERTA** — recomendado Node.js + TypeScript |
| ADR-002 | El catálogo local es la única fuente de lectura; ninguna petición de usuario toca una API externa | ✅ |
| ADR-003 | Capa anticorrupción con `GameAdapter` por juego | ✅ |
| ADR-004 | Ingesta por lotes idempotente, reanudable, con cola por host | ✅ |
| ADR-005 | Sobres dirigidos por datos + PRNG sembrado (determinismo auditable) | ✅ |

## Problemas registrados
P-001 (hotlinking YGO, 🔴), P-002 (rate limits heterogéneos, 🟠), P-003 (distribuciones de sobre
no expuestas, 🟠), P-004 (volumen del bulk de Scryfall, 🟡).

## Estado al cerrar la sesión
- Vault: **INICIALIZADO** — 6 carpetas, 16 documentos.
- Código de aplicación: **0 líneas**. Bloqueado por ADR-001.
- Tareas: 4 realizadas, 14 pendientes, 2 bloqueadas.

## Siguiente acción esperada
Confirmación del usuario sobre ADR-001 y emisión de la primera tarea de código.
