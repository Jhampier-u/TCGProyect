# Tareas Realizadas

**Última actualización:** 2026-08-25 (S017)

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
| T-018 | `card_prints.in_boosters` (migración 0004) + `DomainPrint.inBoosters` + mapeo en ambos adaptadores | Base de Datos / Backend | 2026-08-25 | S008 | `db/migrations/0004_*`, `packages/shared` |
| T-018v | Verificación: 4 tests nuevos + ingesta de 8221 impresiones + ciclo up/down/up del índice | QA | 2026-08-25 | S008 | Ver S008 en `005Registro` |
| T-013 | `PokemonTcgAdapter`: paginación, clave de API, normalización de `hp` y ataques | Backend | 2026-08-25 | S009 | `apps/api/src/adapters/pokemontcg/` |
| T-017 | `RedisQuotaStore`: cuota diaria persistida, con la fecha en la clave y TTL a medianoche UTC | Backend | 2026-08-25 | S009 | `apps/api/src/http/redis-quota.ts` |
| T-013v | Verificación: 27 tests + ingesta real de `sv1` + **los 3 juegos en un solo esquema MySQL** | QA | 2026-08-25 | S009 | Ver S009 en `005Registro` |
| T-014 | Job `image-harvest`: descarga única, conversión a WebP, almacenamiento local con 3 salvaguardas | Backend | 2026-08-25 | S010 | `apps/api/src/images/` |
| T-014v | Verificación: 13 tests + cosecha real de los 3 orígenes (94,8 % de reducción, 0 redescargas) | QA / Seguridad | 2026-08-25 | S010 | Ver S010 en `005Registro` |
| T-015 | **ADR-006 resuelta**: `mysql2` + SQL plano + migrador propio, sin ORM ni query builder | Usuario / Arquitectura | 2026-08-25 | S011 | `004Arquitectura/00_ADR.md` |
| T-020 | Capa de datos: `Database`, `Migrator` propio, `CatalogRepository` con upserts por lotes | Base de Datos / Backend | 2026-08-25 | S011 | `apps/api/src/db/` |
| T-021 | **`IngestService`**: orquestador con camino masivo/incremental, checkpoint y aislamiento de fallos | Backend | 2026-08-25 | S011 | `apps/api/src/ingest/` |
| T-021v | Verificación extremo a extremo: migrador + 3 adaptadores + cosecha de imágenes contra MySQL real | QA | 2026-08-25 | S011 | Ver S011 en `005Registro` |
| T-025 | **`PackService`**: motor de sobres determinista con xoshiro128**, respaldo de pool y RN-01/RN-02 | Backend | 2026-08-25 | S012 | `apps/api/src/packs/` |
| T-026 | `PackRepositoryMysql`: pool precargado, persistencia transaccional, reproducción desde lo guardado | Base de Datos | 2026-08-25 | S012 | `apps/api/src/db/pack-repository.ts` |
| T-025v | Verificación: 22 tests + 3.000 sobres reales contra MySQL con las distribuciones contrastadas | QA | 2026-08-25 | S012 | Ver S012 en `005Registro` |
| T-027 | **ADR-007 resuelta**: Fastify, por su serialización por esquema (garantía estructural de P-001) | Arquitectura | 2026-08-25 | S013 | `004Arquitectura/00_ADR.md` |
| T-028 | `CatalogQueryRepository`: búsqueda FULLTEXT, filtros y paginación keyset | Base de Datos | 2026-08-25 | S013 | `apps/api/src/db/catalog-query-repository.ts` |
| T-029 | **API HTTP del catálogo** (H3): 6 endpoints con esquemas de entrada y salida | Backend | 2026-08-25 | S013 | `apps/api/src/api/` |
| T-029v | Verificación: 18 tests + recorrido completo del catálogo real (733/733, sin duplicados) | QA / Seguridad | 2026-08-25 | S013 | Ver S013 en `005Registro` |
| T-030 | **ADR-008 resuelta**: Argon2id + JWT de vida corta, con las defensas contra enumeración y fuerza bruta | Arquitectura / Seguridad | 2026-08-25 | S014 | `004Arquitectura/00_ADR.md` |
| T-031 | Cuentas: `hashPassword`/`verifyPassword` con hash señuelo, `UserRepository` | Seguridad / Backend | 2026-08-25 | S014 | `apps/api/src/auth/` |
| T-032 | `CollectionRepository`: colección paginada, completitud por set y resumen | Base de Datos | 2026-08-25 | S014 | `apps/api/src/db/collection-repository.ts` |
| T-033 | **Rutas autenticadas** (H6): registro, login, sobres y colección. 9 endpoints nuevos | Backend | 2026-08-25 | S014 | `apps/api/src/api/auth-routes.ts` |
| T-033v | Verificación: 22 tests de seguridad + ciclo completo real (registro → 103 sobres → colección) | QA / Seguridad | 2026-08-25 | S014 | Ver S014 en `005Registro` |
| T-024 | Migración 0006: plantilla de sobre moderna de Yu-Gi-Oh! (8 comunes + hit con QCSR) | Base de Datos | 2026-08-25 | S015 | `db/migrations/0006_*` |
| T-024v | Verificación: 2.000 sobres reales · completitud 80 % → **100 %** · QCSR 0/25 → **25/25** | QA | 2026-08-25 | S015 | Ver S015 en `005Registro` |
| T-036 | Arranque real del servidor: `config.ts` con validación estricta + `index.ts` que migra y escucha | Backend | 2026-08-25 | S016 | `apps/api/src/index.ts` |
| T-037 | Servido de imágenes propias en `/images/` con caché inmutable de 1 año | Backend | 2026-08-25 | S016 | `apps/api/src/api/server.ts` |
| T-038 | **Frontend sobrio** (H5): catálogo, acceso, apertura de sobres y colección | Frontend | 2026-08-25 | S016 | `apps/web/src/` |
| T-038v | Verificación en navegador real: ciclo completo y 0 URLs externas en el HTML renderizado | QA / Seguridad | 2026-08-25 | S016 | Ver S016 en `005Registro` |
| T-039 | **Animación de apertura**: revelado carta a carta, orden por escasez, foil y reversos en CSS | Frontend | 2026-08-25 | S017 | `apps/web/src/components/PackReveal.tsx` |
| T-039v | Verificación: 6 tests del orden de revelado + comprobación en navegador de estado, orden y foil | QA | 2026-08-25 | S017 | Ver S017 en `005Registro` |
