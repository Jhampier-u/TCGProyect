# 00 — Contexto Global

**Proyecto:** ProyectoTCG (nombre en clave: *TriplePack*)
**Fecha de inicio:** 2026-08-25
**Estado global:** `FASE 3 — API Y PRODUCTO` · **H1 y H2 completados** · siguiente frente: H3/H4
**Repositorio:** `C:\ProyectoTCG` — Git inicializado en `main`, commit inicial `bc7eb7c` (2026-08-25)

## Estado por área

| Área | Estado | Responsable |
|---|---|---|
| Arquitectura | Definida a nivel macro (ADR-002..005) | Agente Arquitectura |
| Base de datos | **H1 cerrado**: DDL + seeds verificados en MySQL 8.0.42 (T-006/007/008) | Agente Base de Datos |
| Backend | Ingesta completa: 3 adaptadores + cliente + job de imágenes | Agente Backend |
| Frontend | Esqueleto Vite+React compilando y consumiendo `@tcg/shared` | Agente Frontend |
| Ingesta de APIs | **H2 cerrado.** Falta el orquestador que una las piezas (bloqueado por ADR-006) | Agente Backend |
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
2. **R-02 — Hotlinking y ritmo de peticiones.** **MITIGADO POR COMPLETO en S010.** Sus dos mitades
   están cerradas: el *ritmo* con `RateLimitedClient` (T-009, P-002) y el *hotlinking* con el job
   `image-harvest` (T-014, P-001), que descarga una vez, re-hospeda y tiene tres salvaguardas contra
   la redescarga. El invariante "el frontend nunca recibe una URL externa" está codificado en
   `isSafeLocalPath()` y cubierto por tests.
3. **R-03 — Fidelidad de los sobres.** **MITIGADO por completo en S008.** Tiene dos mitades y
   ambas están cerradas:
   - *Qué rarezas salen* → P-003, cerrado en S003 y validado por Monte Carlo.
   - *Qué cartas pueden salir* → P-014, cerrado en S008 con `in_boosters`. Sin él, más de la mitad
     del pool de raras de un set era inalcanzable en un sobre real.
   Detalle de la mitigación original de S003: Las
   distribuciones se sembraron como datos (T-008) con nivel de confianza declarado por número
   y se validaron por Monte Carlo contra las tasas publicadas. Quedan 3 limitaciones acotadas
   y documentadas en P-008.
