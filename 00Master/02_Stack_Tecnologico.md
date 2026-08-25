# 02 — Stack Tecnológico

| Capa | Tecnología | Estado |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | CONFIRMADO |
| Estado servidor | TanStack Query v5 | PROPUESTO |
| Estado cliente | Zustand | PROPUESTO |
| Estilos | TailwindCSS + CSS Modules para animaciones | PROPUESTO |
| Animación de sobres | Framer Motion | PROPUESTO |
| Routing | React Router v6 | PROPUESTO |
| Backend | **Node.js + TypeScript** | ✅ CONFIRMADO (ADR-001, S002) |
| Base de datos | MySQL 8.0.17+ (InnoDB, `utf8mb4_0900_ai_ci`) | ✅ CONFIRMADO |
| Driver / acceso a datos | `mysql2` + SQL plano, sin ORM (ADR-006) | ✅ IMPLEMENTADO (T-020) |
| Migraciones | Migrador propio, ~100 líneas (ADR-006) | ✅ IMPLEMENTADO (T-020) |
| Caché / colas | Redis 7 | PROPUESTO |
| Cliente HTTP externo | `fetch` de Node + cola con límite de tasa propia | ✅ IMPLEMENTADO (T-009) |
| Proceso de imágenes | `sharp` (libvips 8.18.3) → WebP | ✅ IMPLEMENTADO (T-014) |
| Testing unitario | Vitest (front y back) | PROPUESTO |
| Testing E2E | **Cypress** | CONFIRMADO (requisito del usuario) |
| Contenedores | Docker Compose (mysql, redis, api, web) | PROPUESTO |

## Requisitos de versión mínimos

- Node.js ≥ 20 LTS · **MySQL ≥ 8.0.17** · Redis ≥ 7.

**MySQL 8.0.17 es un mínimo duro, no una preferencia.** El esquema usa índices multivaluados
sobre arrays JSON (8.0.17+), `CHECK` constraints (8.0.16+) y `DEFAULT` con expresión (8.0.13+).
Verificado ejecutando la migración contra MySQL **8.0.42** el 2026-08-25.

## Cambio de collation respecto a la propuesta inicial

Se sustituye `utf8mb4_unicode_ci` por **`utf8mb4_0900_ai_ci`**: es la collation por defecto de
MySQL 8, está basada en Unicode 9.0 (frente a Unicode 4.0 de la anterior), es más rápida, y es
**accent-insensitive**, lo que importa mucho en este dominio — permite que buscar `pokemon`
encuentre `Pokémon` y `jotun` encuentre `Jötun` sin normalizar en la aplicación.

## Justificación de MySQL 8

Se usa `JSON` nativo para los campos específicos de cada juego (`game_data`), lo que evita
50+ columnas nullables. MySQL 8 permite indexar esos campos vía columnas generadas
(`GENERATED ALWAYS AS (...) STORED`) — imposible en MySQL 5.7 de forma razonable.
