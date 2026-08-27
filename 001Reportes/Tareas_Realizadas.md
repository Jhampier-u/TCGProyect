# Tareas Realizadas

**Última actualización:** 2026-08-26 (S028)

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
| T-041 | CLI de ingesta (`npm run ingest`). Sin él, un clon nuevo no tenía forma de poblar la base | Backend | 2026-08-25 | S018 | `apps/api/src/cli/ingest.ts` |
| T-042 | `README.md` y `00Master/05_Continuar_Aqui.md`: punto de entrada y de retorno del proyecto | Documentador | 2026-08-25 | S018 | raíz y `00Master/` |
| T-004 | **Docker Compose** (cierra H0): `mysql`, `redis`, `api`, `web` + perfil `ingest`, sin ningún paso manual previo | Arquitectura | 2026-08-25 | S019 | `docker-compose.yml`, `docker/Dockerfile` |
| T-043 | La API crea `STORAGE_PATH` al arrancar. Sin él, `/images` devolvía 404 en un clon nuevo hasta la primera ingesta | Backend | 2026-08-25 | S019 | `apps/api/src/index.ts` |
| T-004v | Verificación contra los contenedores reales: 6 migraciones solas, ingesta de 66 impresiones y catálogo en el navegador vía proxy | QA | 2026-08-25 | S019 | Ver S019 en `005Registro` |
| T-044 | **Motor de validación de mazos** en `@tcg/shared`: contrato + 3 estrategias por juego (RN-04), puro y sin base de datos | Backend / Arquitectura | 2026-08-25 | S020 | `packages/shared/src/deck-rules/` |
| T-045 | `DeckRepository`: CRUD y reemplazo transaccional del contenido, con `user_id` en todo WHERE | Base de Datos | 2026-08-25 | S020 | `apps/api/src/db/deck-repository.ts` |
| T-046 | **Seis rutas de mazos** autenticadas, con esquema de entrada y salida; `requireUser` extraído y compartido | Backend | 2026-08-25 | S020 | `apps/api/src/api/deck-routes.ts` |
| T-049 | **P-024 corregido**: la API no exponía el id de la carta desde H3. El esquema declaraba `cardId` y el repositorio devolvía `id` | Backend | 2026-08-25 | S020 | `apps/api/src/db/catalog-query-repository.ts` |
| T-046v | Verificación: 68 tests nuevos + repositorio contra MySQL real + recorrido completo contra la API en Docker con 489 impresiones | QA / Seguridad | 2026-08-25 | S020 | Ver S020 en `005Registro` |
| T-052 | `DECK_CARD` declara `oracleKey` y `gameData`. Sin ellos, D1 del spec de H7 era imposible de cumplir | Backend | 2026-08-25 | S021 | `apps/api/src/api/deck-schemas.ts` |
| T-047a | `deck-draft.ts`: el borrador del mazo, puro y sin React, con 19 tests | Frontend | 2026-08-25 | S021 | `apps/web/src/lib/deck-draft.ts` |
| T-047b | Cliente de API de mazos y `useDeckEditor` con la validación derivada | Frontend | 2026-08-25 | S021 | `apps/web/src/lib/` |
| T-047c | **Interfaz del constructor**: lista, editor de dos columnas, buscador, zonas y panel de validación | Frontend | 2026-08-25 | S021 | `apps/web/src/pages/`, `components/` |
| T-047v | Verificación en navegador: validación en cliente sin red, banlist aplicada, 0 URLs externas. Destapó P-025 y P-026 | QA | 2026-08-25 | S021 | Ver S021 en `005Registro` |
| T-054 | **P-027 corregido**: las copias se cuentan por nombre. El validador de Pokémon dejaba pasar 16 copias de la misma carta | Backend / QA | 2026-08-26 | S022 | `packages/shared/src/deck-rules/` |
| T-048a | Códecs de los tres formatos: texto de Magic, `.ydk` de Yu-Gi-Oh! y PTCG Live. Puros, 37 tests | Backend | 2026-08-26 | S022 | `packages/shared/src/deck-formats/` |
| T-048b | `oracleKey` en `CARD_SUMMARY` y `POST /api/decks/resolve`, que resuelve sin mutar nada | Backend | 2026-08-26 | S022 | `apps/api/src/` |
| T-048c | `DeckTransferencia`: exportar sin red e importar con informe de lo que falta | Frontend | 2026-08-26 | S022 | `apps/web/src/components/DeckTransferencia.tsx` |
| T-048v | Verificación: ida y vuelta **idéntica byte a byte**, exportar con 0 peticiones, import parcial con su informe | QA | 2026-08-26 | S022 | Ver S022 en `005Registro` |
| T-055 | **Andamiaje de Playwright** y primer test en verde dentro de Docker. Destapó P-028 | QA / Arquitectura | 2026-08-26 | S023 | `e2e/`, `docker/e2e.Dockerfile` |
| T-056 | **ADR-009**: Playwright en lugar de Cypress, con su motivo y su coste | Documentador | 2026-08-26 | S023 | `004Arquitectura/00_ADR.md` |
| T-057 | `fixtures.ts`: usuario propio por test, precondición de datos y sesión inyectada | QA | 2026-08-26 | S023 | `e2e/src/fixtures.ts` |
| T-058 | Recorrido de humo con consola limpia, verificado inyectando un error | QA | 2026-08-26 | S023 | `e2e/src/humo.spec.ts` |
| T-040 | **El volteo de las cartas se ha visto TERMINAR.** Bloqueada desde S017. Destapó P-029 | QA | 2026-08-26 | S023 | `e2e/src/sobres.spec.ts` |
| T-053 | **La interfaz de mazos se ha visto de verdad.** Bloqueada desde S021. Destapó P-030 | QA / Frontend | 2026-08-26 | S023 | `e2e/src/mazos.spec.ts`, capturas |
| T-051 | **401 antes que 400**: `requireUser` pasa a hook de `preValidation`, con las rutas de mazos encapsuladas | Seguridad | 2026-08-26 | S024 | `apps/api/src/api/require-user.ts` |
| T-062 | **Límites de tasa por ruta**. El hueco grande era el registro: 18.000 Argon2id por hora | Seguridad | 2026-08-26 | S024 | `auth-routes.ts`, `deck-routes.ts`, `server.ts` |
| T-063 | **P-031 corregido**: Vitest intentaba ejecutar los specs de Playwright y 3 ficheros fallaban en silencio | QA | 2026-08-26 | S024 | `vitest.config.ts` |
| T-023 | **La ingesta acotada ya no se lleva sets sin publicar.** En Magic los dos primeros eran un Commander y un set de UNA carta | Backend | 2026-08-26 | S025 | `apps/api/src/db/catalog-repository.ts` |
| T-064 | `--set` en el CLI de ingesta: pedir sets concretos. Es lo que desbloqueó T-050 | Backend | 2026-08-26 | S025 | `apps/api/src/cli/ingest.ts` |
| T-050 | **Los dos predicados medidos con datos reales**: 16 Energías Básicas y las nevadas básicas frente a 32 líneas con Snow limitadas a 4 | QA | 2026-08-26 | S025 | Ver S025 en `005Registro` |
| T-016 | Test de deriva entre `GAME_IDS` y el seed SQL. Verificado moviendo YGO al 7 | QA | 2026-08-26 | S025 | `apps/api/src/db/seed-drift.test.ts` |
| T-061 | La rareza en las filas del buscador: tres impresiones ya no se ven idénticas | Frontend | 2026-08-26 | S025 | `apps/web/src/components/DeckBuscador.tsx` |
| T-022 | `npm run db:migrate`. Destapó **P-032**: la 0001 fija el nombre de la base con un `USE` | Backend | 2026-08-26 | S025 | `apps/api/src/cli/migrate.ts` |
| T-019 | **Una URL de imagen rota deja de reintentarse**: contador de intentos en la migración 0007, con `--retry-failed` para reactivar | Base de Datos / Backend | 2026-08-26 | S026 | `db/migrations/0007_*`, `apps/api/src/images/` |
| T-035 | **Los iconos de set, cosechados y expuestos**: migración 0008, el mismo job de imágenes reutilizado y `iconPath` (ruta local) en la API. Cierra la mitad pendiente de **P-022** | Base de Datos / Backend | 2026-08-26 | S027 | `db/migrations/0008_*`, `apps/api/src/images/`, `apps/api/src/api/schemas.ts` |
| T-034 | **Plantillas de sobre por época**: la época pasa a ser propiedad de la plantilla (`valid_from`/`valid_to`), no del set. Cierra **P-021** y el hueco moderno que la medición destapó. Añade `npm run packs:cobertura` | Base de Datos / Backend | 2026-08-26 | S028 | `db/migrations/0009-0011`, `apps/api/src/packs/coverage.ts` |
| T-068 | **El techo de Pokémon, cerrado**: dos plantillas de época (migración 0012). Al medirlo apareció que el 28,5 % del slot del hit pedía rarezas que no existen en ningún set: `rare` bajó del 72,3 % al 53,7 %. Cierra **P-034** y destapó **P-035** | Base de Datos | 2026-08-26 | S028 | `db/migrations/0012_*` |
| T-070 | **El desperdicio, en el informe**: `pesoSinDestino` mide el peso que una plantilla dedica a rarezas que **ningún** set del juego tiene. Es lo que hubo que contar a mano para encontrar P-034 | Backend | 2026-08-26 | S028 | `apps/api/src/packs/coverage.ts` |
| T-069 | **Qué set es de verdad un producto de sobres** (migración 0013): aritmética + patrones, comprobado contra los 2254 nombres reales. Cierra **P-033**; con ello los tres juegos quedan "todos los sets son completables" | Base de Datos / Backend | 2026-08-26 | S028 | `db/migrations/0013_*`, `apps/api/src/ingest/openable.ts` |
| T-071 | **Un almacén mal configurado se nota al arrancar**: la API compara lo que la base dice con lo que hay bajo `STORAGE_PATH`. Cierra **P-036** | Backend | 2026-08-26 | S028 | `apps/api/src/images/store-check.ts` |
| T-072 | **La suite E2E se puede relanzar**: de 6 altas por vuelta a 1 (fixture de ámbito worker). Destapó **P-037** (las imágenes se comían el límite) y **P-038** (el tope global no cubría el catálogo) | QA / Backend | 2026-08-26 | S028 | `e2e/src/fixtures.ts`, `apps/api/src/api/server.ts` |
| T-065 | **Una migración deja de elegir base**: el migrador retira los `USE`/`CREATE DATABASE` y comprueba que nadie se cambia. Cierra **P-032** y permite por fin una base de pruebas | Base de Datos | 2026-08-26 | S028 | `apps/api/src/db/migration-sql.ts`, `migrator.ts` |
| T-066 | **Los iconos de set, visibles**: panel de completitud y un desplegable propio que sustituye al `<select>` (un `<option>` no puede llevar imagen). Con teclado completo, roles ARIA y 4 tests E2E | Frontend | 2026-08-26 | S028 | `apps/web/src/components/SelectorDeSet.tsx`, `e2e/src/iconos.spec.ts` |
| T-067 | **Los sets sin publicar dejan de ser abribles**: dos de los cuatro "de composición atípica" eran sets a medio revelar, no productos raros. Regla objetiva, no otra estimación | Backend | 2026-08-26 | S028 | `apps/api/src/ingest/openable.ts` |
| T-005 | **API key de Pokémon TCG** puesta y verificada. Desbloquea la ingesta completa | Usuario | 2026-08-26 | S028 | `.env` (no versionado) |
| T-074 | **La era Sword & Shield y dos huecos de Scarlet & Violet** (migración 0014). Salió de que la ingesta creciera ×3,6 y el informe señalara 11 sets con cartas inalcanzables | Base de Datos | 2026-08-26 | S028 | `db/migrations/0014_*` |
| T-075 | **Reingestados los dos sets caídos**: `Crown Zenith` (160) y `Black Star Promos` (200), a la primera. Destapó dos huecos del clasificador: las bolsas de promocionales y que el comando documentado de ingesta no reconstruía la imagen | Backend | 2026-08-26 | S028 | `apps/api/src/ingest/openable.ts`, `README.md` |
| T-076 | **`cmc` ensanchada a DECIMAL(9,1)** (migración 0015). La ingesta completa de Magic abortaba: las cartas de los Un-sets tienen coste de maná 1.000.000 y la columna topaba en 999,9. Cierra **P-039** | Base de Datos | 2026-08-26 | S028 | `db/migrations/0015_*` |
| T-079 | **Las cinco épocas históricas de Pokémon** (migración 0018) y las bóvedas shiny al clasificador. Magic y Pokémon quedan a cero sets con cartas inalcanzables | Base de Datos | 2026-08-27 | S028 | `db/migrations/0018_*` |
| T-073 | **La densidad de *Black Bolt* / *White Flare***: el hit pasa de dar el 10,2 % a las Illustration Rare a darles el 66,3 %, medido sobre 300 sobres. Estimado con una regla explícita, no a ojo | Base de Datos | 2026-08-27 | S028 | `db/migrations/0019_*` |
