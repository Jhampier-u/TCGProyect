# S004 — T-003 (monorepo) y T-010 (`GameAdapter`)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sí, lanza T-003 y T-010"*.

## Agentes invocados
1. **Agente Arquitectura** — estructura del monorepo, project references, refinamiento de ADR-003.
2. **Agente Backend** — tipos de dominio, `GameAdapter`, utilidades de normalización.
3. **Agente Frontend** — esqueleto Vite + React consumiendo `@tcg/shared`.
4. **Agente QA** — suite de tests con los casos reales de las APIs.
5. **Agente Seguridad** — auditoría de dependencias (**no prevista, pero obligatoria**: ver P-011).
6. **Agente Documentador** — sincronización del Vault.

## T-003 — Monorepo

Se eligió **npm workspaces** en vez de pnpm o Turborepo: ya está en la caja con npm 11, y el
proyecto tiene tres paquetes, no treinta. Meter una herramienta más sería coste sin beneficio.

```
package.json          workspaces: packages/*, apps/*
tsconfig.base.json    strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
tsconfig.json         project references -> shared, api, web
packages/shared/      @tcg/shared  (sin dependencias de runtime)
apps/api/             @tcg/api     (depende de shared)
apps/web/             @tcg/web     (Vite + React, depende de shared)
```

Se usan **project references** de TypeScript, no rutas relativas entre paquetes: `tsc --build`
compila en orden de dependencia y falla si alguien introduce un ciclo.

## T-010 — El contrato

| Fichero | Contenido |
|---|---|
| `game.ts` | `GameCode`, `GAME_IDS` (1=MTG, 2=YGO, 3=PTCG), constantes de juego |
| `game-data.ts` | `MtgGameData`, `YgoGameData`, `PtcgGameData` — **en snake_case a propósito** |
| `domain.ts` | `DomainSet`, `DomainCard<G>`, `DomainPrint<G>`, `PackTemplateSpec` |
| `adapter.ts` | `GameAdapter<G>`, `IngestWarning`, `IngestWarningSink` |
| `normalize.ts` | `normalizeRarityCode`, `toJsonNumber`, `toStringArray`, … |

### Dos decisiones de diseño que merecen constar

**1. `game_data` va en snake_case, al revés que el resto del dominio.** No es un descuido. Esas
claves son un contrato con las columnas generadas del DDL: `cmc` lee `$.cmc`, `atk` lee `$.atk`,
el índice multivaluado lee `$.colors`. Renombrar una a camelCase no rompería la compilación —
rompería el índice **en silencio**, dejándolo siempre a NULL. Queda documentado en el propio
fichero para que nadie lo "arregle" en el futuro.

**2. `GameAdapter` es genérico sobre el juego.** Un `GameAdapter<'MTG'>` produce
`DomainPrint<'MTG'>` cuyo `gameData` es `MtgGameData`, no la unión de los tres perfiles. El
compilador impide que un adaptador escriba por error un campo de otro juego. Ésta es,
literalmente, la clase de bug que se citó en ADR-001 para justificar Node + TypeScript.

### Refinamiento de ADR-003
`fetchCards` → **`fetchPrints`**. Lo que la ingesta necesita es la impresión (con set, rareza e
imagen), que lleva la carta conceptual embebida. El nombre anterior apuntaba a otra tabla.

## Verificación

| Prueba | Resultado |
|---|---|
| `tsc --build` (strict, 3 paquetes) | ✅ exit 0, sin errores |
| `vitest run` | ✅ **17/17** en 371 ms |
| API compilada ejecutándose | ✅ imprime `1 MTG / 2 YGO / 3 PTCG` — coincide con el seed |
| `vite build` de producción | ✅ 17 módulos, 141 kB (45,9 kB gzip) |
| `npm audit` | ✅ **0 vulnerabilidades** (tras P-011) |

Los tests no usan casos inventados: van contra las cadenas reales muestreadas en S003
(`"PLatinum Secret Rare"`, `"2"`, `"3"`, `"Rare Holo LV.X"`, `"MEGA_ATTACK_RARE"`, `"atk": "?"`).

## Problemas

**P-010 — abierto y cerrado (🔴 de haber llegado a producción).** Al escribir el test de
`normalizeOracleKeyFromName` se descubrió que `Nidoran♂` y `Nidoran♀` producían ambos el
`oracleKey` `nidoran`. Con `UNIQUE (game_id, oracle_key)` e `INSERT ... ON DUPLICATE KEY UPDATE`,
el segundo habría **sobrescrito** al primero: dos Pokémon distintos fusionados en uno, sin error
ni aviso, con una carta desaparecida del catálogo y de los sobres. Corregido mapeando los signos
de género a `-m` y `-f`, con test de regresión.

**P-011 — abierto y cerrado.** El primer `npm install` arrastró 5 vulnerabilidades, una crítica
en `vitest` y dos de `vite` **específicas de Windows** (divulgación de hash NTLMv2 vía rutas UNC,
bypass de `server.fs.deny`). Resuelto subiendo a vitest 4.1.11 / vite 8.2.2. `npm audit` pasa a
formar parte del criterio de aceptación de toda tarea que toque dependencias.

## Deuda registrada
**T-016** — no existe nada que verifique que `GAME_IDS` de TypeScript y el seed SQL de `games`
digan lo mismo. Hoy coinciden (lo comprobó la ejecución de la API), pero por casualidad, no por
construcción.

## Estado al cerrar
- H0 en curso (falta `git init` y Docker) · H1 ✅ · **H2 iniciado**: el contrato ya existe.
- Tareas: 13 realizadas · 10 pendientes · 1 bloqueada.
- Código: 3 migraciones SQL + 7 ficheros TypeScript, todo compilando y testeado.

## Siguiente acción esperada
**T-009** (`RateLimitedClient`) es ahora la única tarea 🔴 desbloqueada y es la que hace falta
para que los tres adaptadores puedan escribirse.
