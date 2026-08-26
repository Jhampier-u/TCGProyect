# 03 — Hitos

| Hito | Nombre | Criterio de aceptación | Estado |
|---|---|---|---|
| **H0** | Fundamentos | Vault inicializado, ADR-001 resuelto, repo Git, Docker Compose levanta | ✅ **COMPLETADO** (S019) — `docker compose up --build` levanta mysql, redis, api y web sin ningún paso manual previo |
| **H1** | Esquema de datos | DDL MySQL aplicado + migraciones + seeds de `games` y `rarities` | ✅ **COMPLETADO** (3 migraciones verificadas en MySQL 8.0.42) |
| **H2** | Ingesta | Los 3 conectores pueblan `sets`/`cards`/`card_prints`; catálogo consultable | ✅ **COMPLETADO** (3 adaptadores + cliente + job de imágenes, todos verificados contra los orígenes reales) |
| **H3** | API de catálogo | `GET /api/cards` con búsqueda, filtros y paginación keyset | ✅ **COMPLETADO** (6 endpoints, Fastify, verificados sobre el catálogo real) |
| **H4** | Motor de sobres | `POST /api/packs/open` determinista por seed + plantillas por set | ✅ **COMPLETADO** — el endpoint quedó expuesto y protegido en H6 |
| **H5** | Frontend sobres | Animación de apertura + reveal + push a colección | ✅ **COMPLETADO** (revelado carta a carta, orden por escasez, foil, movimiento reducido) |
| **H6** | Cuentas y colección | Auth, colección persistente, completitud por set | ✅ **COMPLETADO** (Argon2id + JWT, 9 endpoints, verificado con 103 sobres reales) |
| **H7** | Deckbuilder | CRUD de mazos + validadores por juego + import/export | ✅ **COMPLETADO** (S022) — motor de reglas, 6 endpoints, interfaz e import/export. **Ultima epica de producto del alcance v1.0** |
| **H8** | Endurecimiento | Suite E2E verde (**ADR-009**: Playwright, no Cypress), auditoría de seguridad, rate limiting propio | 🟡 EN CURSO — **H8a hecho** (S023): 6 recorridos en verde, T-040 y T-053 cerradas. Quedan H8b (seguridad) y H8c (deuda) |

**Regla de progresión:** no se abre un hito sin que el anterior tenga su reporte cerrado en
`001Reportes/Tareas_Realizadas.md`.
