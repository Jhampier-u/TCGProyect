# Tareas Realizadas

**Última actualización:** 2026-08-25 (S007)

| ID | Tarea | Agente | Fecha | Sesión | Evidencia |
|---|---|---|---|---|---|
| T-000 | Inicialización del Vault: estructura de 6 carpetas + 16 documentos base | Documentador / Arquitectura | 2026-08-25 | S001 | `C:\ProyectoTCG\` |
| T-000a | Verificación en vivo de disponibilidad de las 3 APIs externas | Backend | 2026-08-25 | S001 | Scryfall 200 · PTCG 200 · YGO doc. |
| T-000b | Definición de alcance de producto v1.0 y reglas de negocio RN-01..RN-05 | Arquitectura | 2026-08-25 | S001 | `00Master/01_Producto.md` |
| T-000c | Estrategia de las 3 APIs y política de rate limiting | Arquitectura / Backend | 2026-08-25 | S001 | `004Arquitectura/01_Estrategia_APIs.md` |
| T-002 | **ADR-001 resuelta**: backend en Node.js + TypeScript | Usuario / Arquitectura | 2026-08-25 | S002 | `004Arquitectura/00_ADR.md` |
| T-006 | **DDL MySQL 8 completo**: 13 tablas, 20 FK, 8 CHECK, índice multivaluado, FULLTEXT | Base de Datos | 2026-08-25 | S002 | `db/migrations/0001_initial_schema.up.sql` |
| T-006v | Verificación del DDL ejecutándolo contra MySQL 8.0.42 real (ciclo up/down/up + pruebas funcionales) | Base de Datos / QA | 2026-08-25 | S002 | Ver S002 en `005Registro` |
| T-007 | Seeds de `games` y `rarities`: 66 rarezas (MTG 6 · YGO 22 · PTCG 38), idempotentes | Base de Datos | 2026-08-25 | S003 | `db/migrations/0002_seed_games_rarities.sql` |
| T-008 | Seeds de `pack_templates`/`pack_slots`: 3 plantillas, 33 slots, con derivación documentada | Base de Datos | 2026-08-25 | S003 | `db/migrations/0003_seed_pack_templates.sql` |
| T-008v | Validación Monte Carlo (200.000 sobres/juego) contra las tasas publicadas | QA | 2026-08-25 | S003 | Ver S003 en `005Registro` |
| T-003 | Monorepo npm workspaces: `apps/web`, `apps/api`, `packages/shared` + project references | Arquitectura | 2026-08-25 | S004 | `package.json`, `tsconfig.base.json` |
| T-010 | Interfaz `GameAdapter` + tipos de dominio + utilidades de normalización | Backend / Arquitectura | 2026-08-25 | S004 | `packages/shared/src/` |
| T-010v | Verificación: `tsc --build` limpio, 17/17 tests, build de web OK, 0 vulnerabilidades | QA / Seguridad | 2026-08-25 | S004 | Ver S004 en `005Registro` |
| T-001 | `git init` + `.gitattributes` + commit inicial (`bc7eb7c`, 49 ficheros) | Arquitectura | 2026-08-25 | S005 | `git log` |
| T-009 | `RateLimitedClient`: cola por host, backoff con jitter, `Retry-After`, cortocircuito, cuota diaria | Backend | 2026-08-25 | S005 | `apps/api/src/http/` |
| T-009v | Verificación: 38/38 tests con reloj virtual + prueba de humo contra Scryfall y YGOPRODeck reales | QA | 2026-08-25 | S005 | Ver S005 en `005Registro` |
| T-012 | `YgoprodeckAdapter`: sets, impresiones, banlist, normalización de rarezas y acabados | Backend | 2026-08-25 | S006 | `apps/api/src/adapters/ygoprodeck/` |
| T-012v | Verificación: 18 tests + ingesta real de *Supreme Darkness* insertada en MySQL 8.0.42 | QA | 2026-08-25 | S006 | Ver S006 en `005Registro` |
| T-011 | `ScryfallAdapter`: volcado JSONL en streaming + camino incremental paginado | Backend | 2026-08-25 | S007 | `apps/api/src/adapters/scryfall/` |
| T-011a | `RateLimitedClient.stream()`: cuerpo como flujo de bytes, para descargas grandes | Backend | 2026-08-25 | S007 | `apps/api/src/http/` |
| T-011v | Verificación: 24 tests + volcado real de 116.752 impresiones (210 MB de pico) + ingesta en MySQL | QA | 2026-08-25 | S007 | Ver S007 en `005Registro` |
