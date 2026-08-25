# 00 — Contexto Global

**Proyecto:** ProyectoTCG (nombre en clave: *TriplePack*)
**Fecha de inicio:** 2026-08-25
**Estado global:** `FASE 2 — INGESTA` · **H1 completado** · siguiente frente: H2
**Repositorio:** `C:\ProyectoTCG` — **sin control de versiones aún** (ver T-001)

## Estado por área

| Área | Estado | Responsable |
|---|---|---|
| Arquitectura | Definida a nivel macro (ADR-002..005) | Agente Arquitectura |
| Base de datos | **H1 cerrado**: DDL + seeds verificados en MySQL 8.0.42 (T-006/007/008) | Agente Base de Datos |
| Backend | Monorepo en pie · contrato `GameAdapter` definido y tipado | Agente Backend |
| Frontend | Esqueleto Vite+React compilando y consumiendo `@tcg/shared` | Agente Frontend |
| Ingesta de APIs | Estrategia definida, implementación pendiente | Agente Backend |
| QA | Sin iniciar | Agente QA |
| Seguridad | Auditoría de dependencias: 0 vulnerabilidades (S004) | Agente Seguridad |

## Decisiones cerradas

**ADR-001 — RESUELTA (2026-08-25).** Backend en **Node.js + TypeScript**. Desbloquea H1 y H2.

## Decisión abierta (no bloqueante)

**ADR-006 — ORM y migrador.** Recomendación: SQL plano versionado + migrador ligero, porque
ningún ORM de Node modela hoy columnas generadas ni índices multivaluados, que el esquema usa.

## Riesgos vivos (top 3)

1. **R-01 — Volumen de datos.** El catálogo unificado ronda las ~110.000 impresiones de carta
   (MTG ~100k prints, YGO ~13k cartas, PTCG ~20k). La ingesta ingenua tarda horas y puede
   provocar baneo de IP. Mitigado por la estrategia de ingesta por lotes (ADR-004).
2. **R-02 — Hotlinking de imágenes.** YGOPRODeck **blacklistea la IP** si se enlazan sus imágenes
   en caliente. Obliga a una capa de almacenamiento propio de imágenes desde el día 1.
3. **R-03 — Fidelidad de los sobres.** ~~Riesgo abierto~~ → **MITIGADO en S003**. Las
   distribuciones se sembraron como datos (T-008) con nivel de confianza declarado por número
   y se validaron por Monte Carlo contra las tasas publicadas. Quedan 3 limitaciones acotadas
   y documentadas en P-008.
