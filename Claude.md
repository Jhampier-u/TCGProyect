# Claude.md — Orquestador del Vault (ProyectoTCG)

> **Rol:** Arquitecto Principal y Orquestador de Proyectos de Software.
> **Producto:** Simulador de Apertura de Sobres + Constructor de Mazos unificado para MTG, Yu-Gi-Oh! y Pokémon TCG.
> **Estado del Vault:** ACTIVO — última sesión S008 (2026-08-25)

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
├── Claude.md                    <- este archivo (Orquestador)
├── 00Master\                    <- contexto absoluto, verdad única
│   ├── 00_Contexto_Global.md
│   ├── 01_Producto.md
│   ├── 02_Stack_Tecnologico.md
│   ├── 03_Hitos.md
│   └── 04_Diccionario_Datos.md
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
│   └── 03_Infraestructura.md
├── 005Registro\
│   ├── 2026-08-25_S001_Inicializacion.md
│   ├── 2026-08-25_S002_DDL_MySQL.md
│   ├── 2026-08-25_S003_Seeds.md
│   ├── 2026-08-25_S004_Monorepo_GameAdapter.md
│   ├── 2026-08-25_S005_Git_RateLimitedClient.md
│   ├── 2026-08-25_S006_YgoprodeckAdapter.md
│   ├── 2026-08-25_S007_ScryfallAdapter.md
│   └── 2026-08-25_S008_InBoosters.md
│
├── db\                          <- esquema (fuera del Vault documental)
│   ├── README.md
│   └── migrations\
│       ├── 0001_initial_schema.up.sql / .down.sql
│       ├── 0002_seed_games_rarities.sql
│       ├── 0003_seed_pack_templates.sql
│       └── 0004_add_in_boosters.{up,down}.sql
│
├── packages\shared\             <- @tcg/shared: contrato de dominio
│   └── src\
│       ├── game.ts          GameCode, GAME_IDS
│       ├── game-data.ts     perfiles JSON por juego (snake_case, contrato con el DDL)
│       ├── domain.ts        DomainSet, DomainCard<G>, DomainPrint<G>
│       ├── adapter.ts       GameAdapter<G>, IngestWarning
│       ├── normalize.ts     normalizeRarityCode, toJsonNumber, ...
│       ├── normalize.test.ts
│       └── index.ts
│
├── apps\api\                    <- @tcg/api
│   └── src\
│       ├── http\               RateLimitedClient: unica salida a las 3 APIs
│       │                       types · policies · errors · quota · client
│       └── adapters\
│           ├── ygoprodeck\     YgoprodeckAdapter (T-012)
│           └── scryfall\       ScryfallAdapter + lector JSONL gz (T-011)
├── apps\web\                    <- @tcg/web (Vite + React)
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
