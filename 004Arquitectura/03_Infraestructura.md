# 03 — Infraestructura

## Topología de desarrollo (Docker Compose)

**Implementada y verificada en S019 (T-004).** `docker-compose.yml` en la raíz; las imágenes propias
salen de `docker/Dockerfile`, un solo fichero con etapas para que la instalación de dependencias se
haga una vez y la compartan backend y frontend.

| Servicio | Imagen | Puerto host | Notas |
|---|---|---|---|
| `web` | propia, `node:22-bookworm-slim` (Vite dev) | 5173 | Proxy `/api` y `/images` → `api` |
| `api` | propia, `node:22-bookworm-slim` | 3000 | Migra al arrancar; sirve `/images` |
| `ingest` | la misma imagen que `api` | — | **Perfil**, no servicio: se ejecuta y termina |
| `e2e` | oficial de Playwright | — | **Perfil**. Suite E2E (ADR-009). Vuelca capturas a `e2e/artefactos/` |
| `mysql` | `mysql:8.0.42` | **3307** | Volumen `db_data`; crea la base y el usuario |
| `redis` | `redis:7-alpine` | 6379 | Volumen `redis_data`, `appendonly` |

```bash
docker compose up --build
docker compose --profile ingest run --rm ingest --game YGO --sets 3
docker compose --profile e2e run --rm e2e
```

`./storage` se monta en `api` y en `ingest`: las imágenes re-hospedadas viven fuera de la imagen y
fuera de git.

### Cuatro decisiones que conviene no revertir

- **Debian y no Alpine.** `sharp` y `@node-rs/argon2` son módulos nativos; sus binarios para musl son
  un camino conocido de fallos en tiempo de arranque. El tamaño de imagen no compensa el riesgo.
- **MySQL se publica en 3307.** La máquina de desarrollo ya tiene un MySQL propio en 3306. Todos los
  puertos son variables: `MYSQL_PORT`, `REDIS_PORT`, `API_PORT`, `WEB_PORT`.
- **El healthcheck de MySQL exige TCP** (`--protocol=tcp`). Durante la inicialización el servidor
  arranca con `--skip-networking`: un ping por socket daría "sano" antes de tiempo y la API se
  lanzaría contra una puerta cerrada.
- **`JWT_SECRET` no tiene valor por defecto.** Compose se niega a arrancar si falta, igual que el
  servidor (ADR-008).

### No hay servicio `worker`

La versión anterior de este documento preveía un `worker` permanente para la ingesta y las imágenes.
No existe: la ingesta es un **CLI que termina** (T-041). Se modela como perfil de compose, que es lo
que de verdad es. Si algún día hay jobs en cola (BullMQ), volverá a ser un servicio.

## Estructura de carpetas propuesta (monorepo)

```
ProyectoTCG/
├── apps/
│   ├── web/            React + Vite
│   └── api/            Backend + CLI de ingesta
├── packages/
│   └── shared/         Tipos de dominio compartidos (GameCode, DomainPrint, …)
├── storage/cards/      Imágenes re-hospedadas (NO en git)
├── db/migrations/      DDL versionado
└── e2e/                Playwright (ADR-009; el hito decia Cypress hasta S023)
```

## Variables de entorno

```
DATABASE_URL=mysql://tcg:***@mysql:3306/proyecto_tcg
REDIS_URL=redis://redis:6379
POKEMONTCG_API_KEY=***            # obtener en dev.pokemontcg.io
EXTERNAL_USER_AGENT=ProyectoTCG/0.1 (+mailto:...)
STORAGE_PATH=/app/storage/cards
JWT_SECRET=***
```

## Presupuestos operativos

- **Almacenamiento de imágenes:** ~~estimado~~ → **MEDIDO en S010 (T-014)**. La estimación de
  ~60 KB por imagen era pesimista: la media real de WebP a 245 px, calidad 82, es de **~18 KB**.

  | | Estimado (S001) | Medido (S010) |
  |---|---|---|
  | Por imagen | ~60 KB | **~18 KB** |
  | 110.000 prints | 6–7 GB | **~1,9 GB** |
  | Reducción frente al original | — | **94,8 %** |

  **Decisión v1 sin cambios:** guardar sólo `small` + generar `large` bajo demanda con caché. Pero
  el almacenamiento deja de ser un riesgo de coste: 1,9 GB cabe en cualquier sitio.
- **Iconos de set:** MEDIDO en S027 (T-035). Ancho 64 px, no 245: un icono se pinta junto al nombre
  de un set, no a tamaño de carta.

  | | |
  |---|---|
  | Sets con icono en el origen | 2.129 |
  | **URLs distintas** | **1.101** |
  | Ficheros en disco | 1.101 |
  | Peso total | **4,7 MB** (MTG 1,4 · YGO 2,6 · PTCG 0,7) |
  | Descargados / evitados por deduplicación | 1.096 / 1.027 |
  | 12,6 MB de origen → | 2,27 MB de WebP (**82 %** menos) |

  Los 1.028 sets que comparten icono con otro **no generaron ni una petición**: el fichero se nombra
  por la URL, no por el set, así que el segundo lo encuentra ya en disco. Frente a nombrarlo por el
  set, son ~1.000 peticiones menos contra Scryfall y YGOPRODeck. Ver `iconKeyFromUrl`.
- **Ingesta inicial completa:** estimada en 6–10 h dominada por la descarga de imágenes,
  no por los datos (los datos: MTG ~5 min con bulk, YGO ~2 min, PTCG ~30 min).
