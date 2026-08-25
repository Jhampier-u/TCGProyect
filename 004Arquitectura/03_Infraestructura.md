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

- **Almacenamiento de imágenes:** ~110.000 prints × ~60 KB (WebP small) ≈ **6–7 GB**;
  con `large` (745px) ≈ 25–30 GB. **Decisión v1:** guardar sólo `small` + generar `large`
  bajo demanda con caché. Registrado como riesgo de coste.
- **Ingesta inicial completa:** estimada en 6–10 h dominada por la descarga de imágenes,
  no por los datos (los datos: MTG ~5 min con bulk, YGO ~2 min, PTCG ~30 min).
