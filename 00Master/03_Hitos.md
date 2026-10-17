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
| **H8** | Endurecimiento | Suite E2E verde (**ADR-009**: Playwright, no Cypress), auditoría de seguridad, rate limiting propio | ✅ **COMPLETADO (S028)** — H8a suite E2E, H8b seguridad y H8c las ocho tareas de deuda |
| **H9** | Identidad propia por juego | Cada juego con su sección, su catálogo, su categorización, sus mazos y **dos colecciones** (simulación y real). Rediseño completo de la interfaz | 🟡 **EN CURSO (S033)** — H9a cerrado en S034 y **H9b en S037**: Pokémon tiene catálogo con «me faltan» y ficha. **H9e (Holo Noir y la apertura épica), adelantado por decisión del usuario, cerrado en S037** (T-098 a T-107; spec 17, plan 18): rarezas en cinco niveles por juego, sobre sellado por época y set, y el ritual completo. Después, H9c (colecciones) y H9d (mazos por juego) |

## Hoja de ruta posterior a H9

Salida de la lluvia de ideas de S037: el usuario eligió once de doce ideas (fuera, la app
instalable). Ninguna es hito todavía; cada una tendrá su spec, en este orden sugerido. Detalle y motivo
del orden en la sección 8 de `17_Spec_H9e_HoloNoir.md`.

1. Tu suerte frente a la real · 2. Repetir y compartir una apertura · 3. Logros · 4. Lista de deseos ·
5. Sonido en la apertura · 6. Abrir una caja entera · 7. Probar la mano inicial · 8. Modo sellado ·
9. Buscador global · 10. Las secciones de Magic y Yu-Gi-Oh! (con el perfil de facetas por juego).

La carpeta, que también se eligió, ya es H9c.

**Regla de progresión:** no se abre un hito sin que el anterior tenga su reporte cerrado en
`001Reportes/Tareas_Realizadas.md`.
