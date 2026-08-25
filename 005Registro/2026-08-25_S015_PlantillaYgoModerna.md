
# S015 — T-024: plantilla de sobre moderna de Yu-Gi-Oh!
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"T-024 y luego H5"*. Esta sesión cubre T-024.

## Agentes invocados
1. **Agente Base de Datos** — investigación de la estructura real y migración 0006.
2. **Agente QA** — verificación con 2.500 sobres reales sobre dos sets de épocas opuestas.
3. **Agente Documentador** — Vault.

---

## El diagnóstico de P-019 estaba incompleto

Se sabía que faltaba la Quarter Century Secret Rare. Al buscar la estructura real en lugar de
suponerla, **Yugipedia** reveló algo mayor:

> ***Eternity Code*** (abril 2020) — presente: **8 comunes + 1 carta de rareza superior**

**El slot de `Rare` desapareció de los sobres de Yu-Gi-Oh! en 2020.** Nuestra plantilla no sólo
olvidaba una rareza: describía una estructura obsoleta desde hacía cinco años.

Y explica retroactivamente algo de S012: que el motor entregara 8 comunes por sobre era, por
casualidad, **lo correcto**. Pero llegaba ahí por el camino del respaldo y emitiendo un aviso en cada
sobre. Un acierto accidental que parecía un defecto.

Composición histórica completa, capturada para trabajo futuro:

| Época | Estructura | Carta final |
|---|---|---|
| 2002 – 2008 | 8 comunes + 1 | 1/24 Secret · 1/12 Ultra · 1/4 Super · resto Rare |
| 2008 – 2015 | 7 comunes + 1 Rare + 1 | 1/24 Secret · 1/12 Ultra · 1/4 Super · resto Common |
| 2016 – 2020 | 7 comunes + 1 Rare + 1 | 1/12 Secret · 1/6 Ultra · resto Super |
| **2020 – hoy** | **8 comunes + 1** | **1/12 Secret · 1/6 Ultra · resto Super** |

---

## La migración

Slot 8 con la QCSR incorporada. Los tres pesos base son `[OFICIAL]`; la QCSR es `[ESTIMADO]` —el
fabricante no publica su tasa y los seguimientos de la comunidad sitúan ~1 por caja de 24— y se
reescalan los otros tres por 0,958 para que el total siga sumando 1000:

```
super_rare 718 · ultra_rare 160 · secret_rare 80 · quarter_century_secret_rare 42
```

**Una sola plantilla sirve para todos los sets modernos.** En un set sin QCSR, el respaldo del motor
(S012) cae a Super Rare, que es exactamente lo correcto. No hacen falta plantillas por set.

---

## Una corrección de proceso a mí mismo

Al escribir la migración añadí una nota de "OBSOLETA" a la cabecera de la `0003`, para que nadie
tomara sus pesos por vigentes. Un comentario no cambia el comportamiento… pero **viola la convención
que yo mismo escribí en S008**: las migraciones publicadas son inmutables.

La regla existe justo para no razonar "es sólo un cambio pequeño". Se revirtió la edición. La
explicación completa ya vive en la `0006` y aquí, que es donde corresponde.

---

## Verificación

### 2.000 sobres de *Supreme Darkness* (set moderno, con QCSR)

| Rareza | Observado por sobre | Esperado |
|---|---|---|
| `common` | 8,0000 | 8 |
| `super_rare` | 0,7220 | 0,718 |
| `ultra_rare` | 0,1560 | 0,160 |
| `secret_rare` | 0,0790 | 0,080 |
| `quarter_century_secret_rare` | **0,0430** | 0,042 |

| | Antes | Después |
|---|---|---|
| QCSR distintas obtenidas | **0 de 25** | **25 de 25** |
| Completitud del set | **80,0 % (techo)** | **100,0 %** |

### 500 sobres de *Legend of Blue Eyes* (2002, sin QCSR)
El respaldo absorbe la cuota de QCSR hacia Super Rare (0,7640 en vez de 0,718) y emite 22 avisos
(≈4,4 %, coincide con el peso 42). Comportamiento correcto y observable.

### Y una salvaguarda que se puso a prueba de verdad
Cambiar la plantilla **no alteró ninguna apertura anterior**, porque `pack_openings.template_snapshot`
congela la configuración vigente al abrir (P-005). Es la primera vez que esa defensa, diseñada en
S002 sobre un supuesto, se enfrenta al caso real que anticipaba.

---

## Un residuo que se documenta en vez de taparse (P-021)

La plantilla nueva describe la estructura vigente. Los sets anteriores a 2020 tenían otra:

| Set | Pool | Alcanzables | Techo |
|---|---|---|---|
| Supreme Darkness (2025) | 125 | 125 | **100 %** |
| Legend of Blue Eyes (2002) | 358 | 253 | **70,7 %** |

Inalcanzable en el set de 2002: `rare` (61), `short_print` (42), `super_short_print` (2).

**Es el mismo problema que P-019 en otra época.** No se arregla ahora porque la solución no es otra
plantilla por defecto —ninguna puede servir para 2002 y para 2025 a la vez— sino **plantillas por set
asignadas según fecha de salida**, y eso exige un paso de asignación posterior a la ingesta que no
existe. Registrado como **T-034**, con la tabla histórica ya capturada.

Prioridad baja y con motivo: el interés del producto está en los sets modernos, que ya funcionan al
100 %.

---

## Estado al cerrar
- H1 ✅ · H2 ✅ · H3 ✅ · H4 ✅ · H6 ✅ · H0: sólo Docker · **H5 es lo único que falta**.
- Tareas: **46 realizadas · 6 pendientes · 1 bloqueada**.
- Problemas: **5 abiertos · 15 cerrados**.
- Tests: **196/196** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
**H5 (frontend).** El backend está completo y la fidelidad de los sobres modernos, verificada. Es la
primera vez en quince sesiones que el producto podría verse.
