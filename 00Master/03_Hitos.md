# 03 — Hitos

| Hito | Nombre | Criterio de aceptación | Estado |
|---|---|---|---|
| **H0** | Fundamentos | Vault inicializado, ADR-001 resuelto, repo Git, Docker Compose levanta | 🟡 EN CURSO (ADR-001 ✅ · monorepo ✅ · Git ✅ · **falta sólo Docker, T-004**) |
| **H1** | Esquema de datos | DDL MySQL aplicado + migraciones + seeds de `games` y `rarities` | ✅ **COMPLETADO** (3 migraciones verificadas en MySQL 8.0.42) |
| **H2** | Ingesta | Los 3 conectores pueblan `sets`/`cards`/`card_prints`; catálogo consultable | ✅ **COMPLETADO** (3 adaptadores + cliente + job de imágenes, todos verificados contra los orígenes reales) |
| **H3** | API de catálogo | `GET /api/cards` con búsqueda, filtros y paginación keyset | ✅ **COMPLETADO** (6 endpoints, Fastify, verificados sobre el catálogo real) |
| **H4** | Motor de sobres | `POST /api/packs/open` determinista por seed + plantillas por set | ✅ **COMPLETADO** — el endpoint quedó expuesto y protegido en H6 |
| **H5** | Frontend sobres | Animación de apertura + reveal + push a colección | ⚪ PENDIENTE |
| **H6** | Cuentas y colección | Auth, colección persistente, completitud por set | ✅ **COMPLETADO** (Argon2id + JWT, 9 endpoints, verificado con 103 sobres reales) |
| **H7** | Deckbuilder | CRUD de mazos + validadores por juego + import/export | ⚪ PENDIENTE |
| **H8** | Endurecimiento | Suite Cypress verde, auditoría de seguridad, rate limiting propio | ⚪ PENDIENTE |

**Regla de progresión:** no se abre un hito sin que el anterior tenga su reporte cerrado en
`001Reportes/Tareas_Realizadas.md`.
