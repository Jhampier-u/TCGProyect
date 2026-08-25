# S012 — Motor de sobres (H4)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sí, lanza H4"*.

## Agentes invocados
1. **Agente Backend** — PRNG y `PackService`.
2. **Agente Base de Datos** — `PackRepositoryMysql`.
3. **Agente QA** — 22 tests + 3.000 sobres reales contra MySQL.
4. **Agente Documentador** — Vault.

---

## xoshiro128** y no mulberry32

ADR-005 dejaba abiertas las dos opciones. Se elige **xoshiro128*\*** por una razón concreta: la
semilla que se persiste son 32 caracteres hexadecimales, o sea **128 bits**. mulberry32 tiene estado
de 32 bits, así que habría que comprimir la semilla y tirar tres cuartas partes de su entropía.
xoshiro128** tiene estado de 128 bits y la aprovecha entera.

Detalle defensivo: un estado todo a ceros es un punto fijo de xoshiro — devolvería 0 para siempre.
Sólo ocurre con una semilla degenerada, pero está guardado.

### El orden de consumo del PRNG es parte del contrato

Por cada slot, en orden de `slot_index`: **una llamada para la rareza, una para la impresión, una
para el foil**. Siempre las tres, incluso cuando `foil_chance` es 0. Saltarse la tercera cuando no
hace falta desalinearía el flujo y haría que dos sobres con la misma semilla divergieran según la
plantilla. Está documentado en el código porque cambiarlo invalida todas las aperturas anteriores.

---

## Decisiones de diseño

**El pool se precarga entero en memoria.** La alternativa evidente, `ORDER BY RAND() LIMIT 1`,
obliga a MySQL a ordenar la tabla en cada slot: 14 escaneos completos por sobre de Magic.

**Respaldo cuando una rareza no existe en el set.** No es un caso raro — un set sin míticas existe, y
la plantilla por defecto sigue pidiendo una mítica el 14 % de las veces. La cadena es: otras rarezas
del mismo slot (por peso descendente) → cualquier rareza del set (por escasez ascendente). Regalar
una común es mejor que entregar un sobre incompleto.

**Persistencia transaccional.** Sin transacción, un fallo a mitad dejaría una apertura registrada
cuyas cartas nunca llegaron a la colección: cartas que "salieron" pero que el usuario no tiene.

---

## Dos hallazgos de la ejecución real

### 1. Un choque de diseño: `UNIQUE (user_id, seed)`

La prueba quiso demostrar el determinismo reabriendo con la misma semilla y chocó con la restricción
que el DDL lleva desde S002. **El test estaba mal, no el esquema**: esa restricción es una guarda de
idempotencia deliberada. Se corrigió demostrando el determinismo con **dos usuarios distintos**.

Pero el error crudo de MySQL no sirve para una API, así que se añadió **`DuplicateSeedError`**: el
repositorio traduce el `ER_DUP_ENTRY` a un error de dominio para que la capa HTTP responda 409 en vez
de filtrar un error del driver.

### 2. Un bug real: la rareza registrada era la pedida, no la entregada (P-018)

*Supreme Darkness* **no tiene ninguna carta `rare`**, pero la plantilla por defecto pide una en el
slot 7. El respaldo entregaba una `common`… y el motor la etiquetaba `rare`.

| Vía | Qué decía |
|---|---|
| `open()` | `rare` |
| `replay()` | `common` (lee `card_prints.rarity_id`) |

**Las dos vías se contradecían**, y RN-01 promete que una apertura es auditable. Si `open()` y
`replay()` no coinciden, esa promesa no significa nada.

Los tests unitarios no lo detectaron porque todos usaban pools con las cinco rarezas presentes: el
respaldo nunca se activaba en el camino que registra la rareza. Corregido y con test de regresión.

---

## Verificación

### Tests — 22 nuevos (156 en total)

### 3.000 sobres contra el catálogo real en MySQL

| Comprobación | Resultado |
|---|---|
| **Determinismo** | Misma semilla, otro usuario → cartas idénticas en el mismo orden ✅ |
| **Idempotencia** | Repetir semilla con el mismo usuario → `DuplicateSeedError` ✅ |
| **RN-01 / P-005** | Plantilla **modificada tras abrir** → la reproducción devuelve las mismas cartas ✅ |
| **RN-02** | 27.009 copias en colección == 27.009 cartas entregadas ✅ |
| `template_snapshot` | 9 slots congelados por apertura ✅ |
| Rendimiento | 54 sobres/s con persistencia completa |

Reparto del *hit* (slot 8), contrastado con las cifras de Konami:

| Rareza | Observado | Esperado |
|---|---|---|
| `super_rare` | **74,87 %** | 75,00 % |
| `ultra_rare` | **16,77 %** | 16,67 % |
| `secret_rare` | **8,37 %** | 8,33 % |

**El motor reproduce las distribuciones que se validaron por Monte Carlo en S003** — pero ahora con
el código real, contra la base de datos real y con las cartas reales del set. P-003 queda cerrado no
sólo en la teoría de los pesos sino en la práctica del motor.

---

## Una limitación que los datos reales pusieron a la vista (P-019)

La plantilla por defecto de Yu-Gi-Oh! describe el Core Booster clásico y los sets modernos han
cambiado:

| Rareza en *Supreme Darkness* | Impresiones | ¿La pide la plantilla? |
|---|---|---|
| `common` | 50 | Sí |
| `super_rare` | 26 | Sí |
| **`quarter_century_secret_rare`** | **25** | **No** |
| `ultra_rare` | 14 | Sí |
| `secret_rare` | 10 | Sí |
| `rare` | **0** | Sí — y no existe |

Consecuencias medidas: **8 comunes por sobre** en vez de 7 (el respaldo del slot 7), y **25 impresiones
inalcanzables** — sólo se ven 100 de las 125 del pool.

**No es un fallo del motor**, que hace exactamente lo que la plantilla dice y avisa cuando recurre al
respaldo. Es que la plantilla no describe este set. Y arreglarlo es **un `INSERT`, no un despliegue**:
exactamente el caso de uso para el que ADR-005 hizo esto configurable por datos. Registrado como
**T-024**.

---

## Estado al cerrar
- H1 ✅ · H2 ✅ · **H4: el motor funciona**; falta exponerlo por HTTP, que depende de H3.
- Tareas: **35 realizadas · 6 pendientes · 1 bloqueada**.
- Problemas: **5 abiertos · 13 cerrados**.
- Tests: **156/156** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
**H3 (API de catálogo)** es lo que falta para que el motor sea accesible desde el frontend, y arrastra
la elección de framework HTTP. Alternativamente **T-004 (Docker)** cierra H0, o **T-024** afina la
fidelidad de los sobres modernos de Yu-Gi-Oh!.
