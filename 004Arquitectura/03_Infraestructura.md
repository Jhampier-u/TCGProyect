# 03 — Infraestructura

## Topología de desarrollo (Docker Compose)

| Servicio | Imagen | Puerto | Notas |
|---|---|---|---|
| `web` | node:20-alpine (Vite dev) | 5173 | Proxy `/api` → `api` |
| `api` | node:20-alpine | 3000 | Backend (pendiente ADR-001) |
| `worker` | node:20-alpine | — | Jobs de ingesta e imágenes |
| `mysql` | mysql:8.0 | 3306 | Volumen `db_data` |
| `redis` | redis:7-alpine | 6379 | Caché de pools + cuotas + BullMQ |

Volumen compartido `./storage/cards` montado en `api` y `worker` para las imágenes locales.

## Estructura de carpetas propuesta (monorepo)

```
ProyectoTCG/
├── apps/
│   ├── web/            React + Vite
│   └── api/            Backend + worker
├── packages/
│   └── shared/         Tipos de dominio compartidos (GameCode, DomainPrint, …)
├── storage/cards/      Imágenes re-hospedadas (NO en git)
├── db/migrations/      DDL versionado
└── e2e/                Cypress
```

## Variables de entorno

```
DATABASE_URL=mysql://tcg:***@mysql:3306/proyecto_tcg
REDIS_URL=redis://redis:6379
POKEMONTCG_API_KEY=***            # obtener en dev.pokemontcg.io
EXTERNAL_USER_AGENT=ProyectoTCG/0.1 (+mailto:...)
STORAGE_PATH=/storage/cards
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
- **Ingesta inicial completa:** estimada en 6–10 h dominada por la descarga de imágenes,
  no por los datos (los datos: MTG ~5 min con bulk, YGO ~2 min, PTCG ~30 min).
