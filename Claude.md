# Claude.md — Orquestador del Vault (ProyectoTCG)

> **Rol:** Arquitecto Principal y Orquestador de Proyectos de Software.
> **Producto:** Simulador de Apertura de Sobres + Constructor de Mazos unificado para MTG, Yu-Gi-Oh! y Pokémon TCG.
> **Estado del Vault:** ACTIVO — última sesión S021 (2026-08-25)

---

## 1. Contrato de operación

Toda interacción sigue este ciclo, sin excepciones:

| Paso | Actor | Acción |
|---|---|---|
| 1 | Usuario | Emite un requerimiento |
| 2 | Orquestador | Analiza, descompone e **invoca** al/los subagente(s) de `002Agents` |
| 3 | Orquestador | Consolida las respuestas y entrega código/solución al usuario |
| 4 | Agente Documentador | Redacta las actualizaciones de `00Master`, `001Reportes`, `003Problemas`, `005Registro` |
| 5 | Orquestador | Emite bloque final con el estado exacto de los archivos del Vault tocados |

**Regla de oro:** ninguna decisión técnica vive sólo en el chat. Si no está en el Vault, no existe.

---

## 2. Mapa del Vault

```
C:\ProyectoTCG\
├── README.md                    <- puesta en marcha (lo primero al clonar)
├── docker-compose.yml           <- entorno completo: mysql, redis, api, web (T-004)
├── docker\Dockerfile            <- imagenes propias de api y web (4 etapas)
├── Claude.md                    <- este archivo (Orquestador)
├── 00Master\                    <- contexto absoluto, verdad única
│   ├── 00_Contexto_Global.md
│   ├── 01_Producto.md
│   ├── 02_Stack_Tecnologico.md
│   ├── 03_Hitos.md
│   ├── 04_Diccionario_Datos.md
│   └── 05_Continuar_Aqui.md   <- PUNTO DE ENTRADA para retomar
├── 001Reportes\
│   ├── Tareas_Realizadas.md
│   ├── Tareas_Pendientes.md
│   └── Tareas_Bloqueadas.md
├── 002Agents\
│   └── 00_Roster_Agentes.md
├── 003Problemas\
│   └── Registro_Problemas.md
├── 004Arquitectura\
│   ├── 00_ADR.md                <- decisiones de arquitectura
│   ├── 01_Estrategia_APIs.md    <- capa anticorrupción de las 3 APIs
│   ├── 02_Flujo_Datos.md
│   ├── 03_Infraestructura.md
│   ├── 04_Spec_H7_Deckbuilder.md  <- spec aprobado (H7, 1a pasada)
│   ├── 05_Plan_H7_Deckbuilder.md  <- plan de implementacion, 10 tareas
│   ├── 06_Spec_T047_Interfaz_Mazos.md <- spec de la interfaz (H7, 2a pasada)
│   ├── 07_Plan_T047_Interfaz_Mazos.md <- plan de implementacion, 8 tareas
│   ├── 08_Spec_T048_ImportExport.md  <- spec de import/export (H7, 3a pasada)
│   └── 09_Plan_T048_ImportExport.md  <- plan de implementacion, 9 tareas
├── 005Registro\
│   ├── 2026-08-25_S001_Inicializacion.md
│   ├── 2026-08-25_S002_DDL_MySQL.md
│   ├── 2026-08-25_S003_Seeds.md
│   ├── 2026-08-25_S004_Monorepo_GameAdapter.md
│   ├── 2026-08-25_S005_Git_RateLimitedClient.md
│   ├── 2026-08-25_S006_YgoprodeckAdapter.md
│   ├── 2026-08-25_S007_ScryfallAdapter.md
│   ├── 2026-08-25_S008_InBoosters.md
│   ├── 2026-08-25_S009_PokemonAdapter_RedisQuota.md
│   ├── 2026-08-25_S010_ImageHarvest.md
│   ├── 2026-08-25_S011_ADR006_Orquestador.md
│   ├── 2026-08-25_S012_MotorDeSobres.md
│   ├── 2026-08-25_S013_ApiCatalogo.md
│   ├── 2026-08-25_S014_CuentasYColeccion.md
│   ├── 2026-08-25_S015_PlantillaYgoModerna.md
│   ├── 2026-08-25_S016_FrontendSobrio.md
│   ├── 2026-08-25_S017_AnimacionDeApertura.md
│   ├── 2026-08-25_S018_PuntoDeGuardado.md
│   ├── 2026-08-25_S019_DockerCompose.md
│   ├── 2026-08-25_S020_ConstructorDeMazos.md
│   └── 2026-08-25_S021_InterfazDeMazos.md
│
├── db\                          <- esquema (fuera del Vault documental)
│   ├── README.md
│   └── migrations\
│       ├── 0001_initial_schema.up.sql / .down.sql
│       ├── 0002_seed_games_rarities.sql
│       ├── 0003_seed_pack_templates.sql
│       ├── 0004_add_in_boosters.{up,down}.sql
│       ├── 0005_widen_set_external_id.{up,down}.sql
│       └── 0006_ygo_modern_booster.{up,down}.sql
│
├── packages\shared\             <- @tcg/shared: contrato de dominio
│   └── src\
│       ├── game.ts          GameCode, GAME_IDS
│       ├── game-data.ts     perfiles JSON por juego (snake_case, contrato con el DDL)
│       ├── domain.ts        DomainSet, DomainCard<G>, DomainPrint<G>
│       ├── adapter.ts       GameAdapter<G>, IngestWarning
│       ├── deck-rules\      motor de validacion de mazos (RN-04, H7)
│       │                   types · predicates · aggregate · mtg · ygo · ptcg
│       ├── normalize.ts     normalizeRarityCode, toJsonNumber, ...
│       ├── normalize.test.ts
│       └── index.ts
│
├── apps\api\                    <- @tcg/api
│   └── src\
│       ├── api\                API HTTP de ENTRADA: Fastify (ADR-007, H3)
│       │                       server · schemas (hacen cumplir P-001)
│       │                       auth-routes · auth-schemas (H6)
│       │                       deck-routes · deck-schemas (H7)
│       │                       require-user (compartido por ambas)
│       ├── auth\               Argon2id + hash señuelo (ADR-008, H6)
│       │                       password · user-repository
│       ├── http\               cliente SALIENTE hacia las 3 APIs externas
│       │                       types · policies · errors · client
│       │                       quota (memoria) · redis-quota (T-017)
│       ├── db\                 mysql2 + SQL plano (ADR-006, T-020)
│       │                       connection · migrator · catalog-repository
│       │                       catalog-query-repository (H3) · pack-repository (H4)
│       │                       collection-repository (H6)
│       │                       deck-repository (H7)
│       ├── cli\                ingest.ts: CLI para poblar el catalogo
│       ├── ingest\             IngestService: el orquestador (T-021)
│       ├── images\             image-harvest: descarga unica + WebP (T-014)
│       │                       harvester · sharp-encoder · file-store
│       ├── packs\              motor de sobres (H4)
│       │                       prng (xoshiro128**) · pack-service
│       └── adapters\
│           ├── ygoprodeck\     YgoprodeckAdapter (T-012)
│           ├── scryfall\       ScryfallAdapter + lector JSONL gz (T-011)
│           └── pokemontcg\     PokemonTcgAdapter (T-013)
├── apps\web\                    <- @tcg/web (Vite + React)
│   └── src│       ├── lib\   api.ts (cliente) · auth.tsx (sesion)
│       ├── lib\   api · auth · deck-draft (borrador puro) · use-deck-editor
│       ├── pages\ Catalogo · Acceso · Sobres · Coleccion · Mazos · MazoEditor
│       └── components\ CardTile · PackReveal · DeckBuscador · DeckZona · DeckValidacion
└── package.json                 <- npm workspaces
```

## 3. Convenciones

- **IDs de tarea:** `T-###` · **Problemas:** `P-###` · **Decisiones:** `ADR-###` · **Sesiones:** `S###`
- **Fechas:** siempre absolutas (`YYYY-MM-DD`), nunca relativas.
- **Idioma:** documentación en español; código, identificadores y commits en inglés.
- **Nomenclatura de dominio:** en el código *siempre* `game` (MTG / YGO / PTCG), nunca "tcg" a secas.
- **El código fuente se mantiene en ASCII puro.** Los caracteres no-ASCII que el código necesite
  (combinantes Unicode, apóstrofos tipográficos, signos ♂/♀) se construyen con
  `String.fromCharCode` o propiedades Unicode (`\p{M}`), nunca como literales. Motivo: un
  combinante suelto en el fuente se pega visualmente al carácter anterior y cualquier herramienta
  que reescriba el fichero puede destruirlo sin que se note. Los comentarios en español sí llevan
  acentos con normalidad.
- **`npm audit` limpio** es criterio de aceptación de toda tarea que toque dependencias (P-011).
- **Las migraciones publicadas son inmutables** (desde S008). Un cambio de esquema es siempre una
  migración nueva, nunca una edición de una anterior. En S003 sí se editó la `0001`, cuando el
  proyecto aún no tenía repositorio; ese ya no es el caso.
