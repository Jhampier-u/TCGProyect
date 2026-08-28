# Tareas Bloqueadas

**Última actualización:** 2026-08-27 (S028) · **Total bloqueadas:** 0

**Nada bloqueado.** Este fichero llevaba **veintiséis sesiones** diciendo que T-013 esperaba una
credencial que llegó en S028. Corregido el 2026-08-27 al revisar el estado de cierre.

---

## Desbloqueadas

### ✅ T-013 — API key de Pokémon TCG · resuelta 2026-08-27 (S028)
La clave está puesta en `.env` y verificada (T-005). Con ella se hizo la **ingesta completa de
Pokémon**: 174 sets. La mitigación que este fichero describía —la API responde 200 sin clave, con
~1.000 peticiones al día— sirvió para desarrollar el adaptador en S009 y dejó de hacer falta.

Lo que este documento hizo mal no fue registrar el bloqueo: fue **no volver a mirarlo**. Es la misma
deriva de P-005 (doce sesiones) y P-032 (tres), y aquí fueron veintiséis.

### ✅ T-002 — Elección de runtime del backend · resuelta 2026-08-25 (S002)
El usuario decidió **Node.js + TypeScript**. Desbloqueó T-003, T-006, T-009 y con ellas los
hitos H1 y H2 completos. Era el bloqueo más caro del proyecto y estuvo abierto una sola sesión.
