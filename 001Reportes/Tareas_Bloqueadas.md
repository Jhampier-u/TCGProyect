# Tareas Bloqueadas

**Última actualización:** 2026-08-25 (S002) · **Total bloqueadas:** 1

| ID | Tarea | Bloqueada por | Tipo | Desbloquea a | Desde |
|---|---|---|---|---|---|
| T-013 | `PokemonTcgAdapter` *en modo producción* | **Falta API key** de Pokémon TCG (T-005) | Credencial externa | Ingesta completa de PTCG | 2026-08-25 |

## Detalle

### T-013 — API key de Pokémon TCG
*Mitigación temporal:* la API responde 200 sin key (verificado 2026-08-25) con una cuota diaria
muy inferior (~1.000/día). Es suficiente para **desarrollar y testear** el adaptador, insuficiente
para la **ingesta completa** (~100 peticiones de cartas + miles de imágenes). No bloquea T-013 en
desarrollo, sólo su ejecución en producción.

---

## Desbloqueadas en esta sesión

### ✅ T-002 — Elección de runtime del backend · resuelta 2026-08-25 (S002)
El usuario decidió **Node.js + TypeScript**. Desbloqueó T-003, T-006, T-009 y con ellas los
hitos H1 y H2 completos. Era el bloqueo más caro del proyecto y estuvo abierto una sola sesión.
