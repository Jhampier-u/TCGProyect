# 00 — Contexto Global

**Proyecto:** ProyectoTCG (nombre en clave: *TriplePack*)
**Fecha de inicio:** 2026-08-25
**Estado global:** `FASE 2 — INGESTA` · **H1 completado** · siguiente frente: H2
**Repositorio:** `C:\ProyectoTCG` — Git inicializado en `main`, commit inicial `bc7eb7c` (2026-08-25)

## Estado por área

| Área | Estado | Responsable |
|---|---|---|
| Arquitectura | Definida a nivel macro (ADR-002..005) | Agente Arquitectura |
| Base de datos | **H1 cerrado**: DDL + seeds verificados en MySQL 8.0.42 (T-006/007/008) | Agente Base de Datos |
| Backend | `GameAdapter` + `RateLimitedClient` + adaptadores **MTG y YGO**. Falta PTCG | Agente Backend |
| Frontend | Esqueleto Vite+React compilando y consumiendo `@tcg/shared` | Agente Frontend |
| Ingesta de APIs | **2 de 3 conectores en pie**, ambos probados extremo a extremo contra MySQL | Agente Backend |
| QA | Sin iniciar | Agente QA |
| Seguridad | Auditoría de dependencias: 0 vulnerabilidades (S004) | Agente Seguridad |

## Decisiones cerradas

**ADR-001 — RESUELTA (2026-08-25).** Backend en **Node.js + TypeScript**. Desbloquea H1 y H2.

## Decisión abierta (no bloqueante)

**ADR-006 — ORM y migrador.** Recomendación: SQL plano versionado + migrador ligero, porque
ningún ORM de Node modela hoy columnas generadas ni índices multivaluados, que el esquema usa.

## Riesgos vivos (top 3)

1. **R-01 — Volumen de datos.** ~~Estimado~~ → **MEDIDO en S007**: sólo MTG son **116.752
   impresiones** en 1048 sets. El volcado completo se procesa en **12,5 s con 210 MB de pico**,
   así que el volumen de *datos* está resuelto (P-004 cerrado). El coste real que queda es la
   descarga de **imágenes** (T-014), no los datos.
2. **R-02 — Hotlinking y ritmo de peticiones.** YGOPRODeck **blacklistea la IP** por hotlinking de
   imágenes y por exceso de peticiones. **Mitigado a medias en S005**: `RateLimitedClient` (T-009)
   controla ya el ritmo con márgenes conservadores y cortocircuito. La mitad de las imágenes sigue
   abierta hasta T-014.
3. **R-03 — Fidelidad de los sobres.** **MITIGADO por completo en S008.** Tiene dos mitades y
   ambas están cerradas:
   - *Qué rarezas salen* → P-003, cerrado en S003 y validado por Monte Carlo.
   - *Qué cartas pueden salir* → P-014, cerrado en S008 con `in_boosters`. Sin él, más de la mitad
     del pool de raras de un set era inalcanzable en un sobre real.
   Detalle de la mitigación original de S003: Las
   distribuciones se sembraron como datos (T-008) con nivel de confianza declarado por número
   y se validaron por Monte Carlo contra las tasas publicadas. Quedan 3 limitaciones acotadas
   y documentadas en P-008.
