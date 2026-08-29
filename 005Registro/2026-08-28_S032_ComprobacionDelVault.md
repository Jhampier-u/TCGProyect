# S032 — La deriva documental, convertida en test (T-087)

**Fecha:** 2026-08-28 · **Sin migración** · **Cierra:** un patrón, no un problema

---

## Requerimiento del usuario

> "Dale, haz eso"

Sobre lo que yo mismo había propuesto al cerrar S031: **un script que compruebe los recuentos y las
referencias del Vault y falle como falla un test**, porque la deriva documental llevaba tres sesiones
siendo el fallo recurrente del proyecto y sólo se detectaba mirando a mano.

---

## El patrón que lo justifica

Doce afirmaciones falsas en tres sesiones, ninguna en el código:

| Sesión | Qué |
|---|---|
| S028 | **P-005** llevaba doce sesiones diciendo "pendiente" de un arreglo hecho y verificado |
| S031 | `Tareas_Bloqueadas.md` llevaba **veintiséis** sesiones citando una credencial que ya había llegado |
| S031 | El diccionario describía `idx_prints_pool` sin `withdrawn_at`, tres sesiones después de que la 0024 lo rehiciera |
| S031 | Una fila del stack decía **Cypress** ocho sesiones después de que ADR-009 lo sustituyera |
| S031 | Dos documentos de arquitectura compartían el número 12, y el mapa sólo listaba uno |
| S031 | El README decía "341 tests" cuando eran 411 |

Todas se encontraron **leyendo**. Un documento que no se revisa no es neutral: miente con autoridad,
y este Vault es el contrato de operación del proyecto.

---

## Qué comprueba

Va como test de Vitest —`tools/vault-consistency.test.ts`— porque es el idioma que el proyecto ya
usa: `seed-drift.test.ts` y `template-eras.test.ts` también leen ficheros del repositorio y afirman
sobre ellos. Corre en cada `npm test`.

**Dieciséis comprobaciones**, todas mecánicas:

- La cabecera del registro de problemas dice los números que hay, y `abiertos + cerrados = total`.
- Los `P-NNN` son únicos y no dejan huecos.
- **El punto de entrada lista exactamente los problemas abiertos** — la que habría cazado a P-008.
- La cabecera de pendientes dice las tareas que hay; ninguna está a la vez pendiente y realizada;
  ninguna se repite.
- Ningún hito está `COMPLETADO` en `03_Hitos.md` y `EN CURSO` en `Tareas_Pendientes.md`.
- Todo fichero citado entre comillas existe.
- El mapa de `Claude.md` lista **todas** las migraciones y **todas** las bitácoras.
- Ni `004Arquitectura` ni `005Registro` repiten un número.
- Cada migración tiene su rollback y la numeración no salta.
- **Los índices que describe el diccionario son los que crea la última migración que los toca.**
- `db/README.md` menciona la migración más reciente.
- El número de recorridos E2E que publican los documentos es el que hay, contado en los specs.
- **Ningún documento vivo publica un recuento de tests de Vitest.**

## Y qué NO comprueba, dicho en el propio fichero

Sólo lo mecánico. **No comprueba prosa.** "Quedan 3 limitaciones acotadas" siendo cero, o un diagrama
que nombra un PRNG que el código no usa, siguen necesitando ojos. Está escrito en la cabecera del test
para que nadie lea un verde y crea que el Vault está revisado.

## Una decisión: prohibir el número en vez de vigilarlo

La primera versión comprobaba que los documentos publicaran **el mismo** recuento de tests. Es
insuficiente y lo vi al medir: los documentos decían 411 y la suite ya iba por **427**, ella incluida.
Desde dentro de la propia suite no hay forma de saber cuántos tests tiene —`it.each` multiplica casos
en tiempo de ejecución—, así que una cifra publicada es una promesa que nadie puede comprobar.

Así que se quita la cifra de los documentos vivos y **el test prohíbe que vuelva**. La de recorridos
E2E sí se publica, porque ésa sí se puede contar leyendo los specs, y por eso se exige que sea la de
verdad. Las bitácoras quedan fuera: su número era cierto el día que se escribió.

Arreglar la fuente en vez de vigilarla es la misma decisión que se tomó con la tabla de migraciones
de `db/README.md`, que se rehízo como índice porque duplicaba lo que ya estaba en cada cabecera.

---

## Y el fallo de la sesión, que es el mejor argumento a favor del banco de mutaciones

Las dieciséis pasaron a la primera. **Eso no demuestra nada**, así que escribí una herramienta que
reintroduce las once derivas históricas una a una y exige que el test falle en cada caso.

Diez fallaron como debían. Una no:

```
  PASA  un documento vivo publica un recuento de tests
```

La comprobación **había nacido muerta**. Un heredoc de Python convirtió su `\b` en un byte 0x08 de
verdad:

```
.filter(([, t]) => /\d+ tests^H/.test(t))
```

`/\d+ tests<BS>/` no casa con nada. El test pasaba en verde por no comprobar absolutamente nada, y al
leerlo no se ve: el carácter de control es invisible. Sólo apareció con `cat -A`.

Es **exactamente** el motivo de la regla de ASCII puro que este proyecto lleva escrita desde S008, y
la segunda vez que un heredoc hace lo mismo. Se corrigió sin heredoc, y se barrió el repositorio
entero: **ni un byte de control en ningún fuente**.

Lo que deja: escribí una comprobación contra la deriva y la comprobación misma nació mintiendo. Sin el
banco de mutaciones habría entrado en `main` con un verde encima.

---

## El banco de mutaciones queda en el repositorio

`npm run vault:mutar`. No corre en `npm test` porque edita ficheros del repositorio, y **se niega a
arrancar si el árbol de trabajo está sucio**, para que un fallo a mitad nunca se confunda con un
cambio tuyo. Restaura siempre, en un `finally`.

```
  ok    recuento de problemas (S031)
  ok    P-008 vuelve a la lista de abiertos (S031)
  ok    cabecera de pendientes (S031)
  ok    un hito COMPLETADO que sigue EN CURSO (S031)
  ok    una cita a un fichero que no existe
  ok    el mapa pierde una migracion (S031)
  ok    el indice del diccionario se queda atras (S031)
  ok    db/README se queda en una migracion vieja (S031)
  ok    recorridos E2E desfasados (S031)
  ok    un documento vivo publica un recuento de tests (S031)
  ok    numeracion duplicada en 004Arquitectura (S031)

  Las 11 derivas historicas se detectan.
```

---

## Dónde vive

`tools/`, con su propio `tsconfig.json` conectado a `npm run typecheck:tests`. No pertenece a ningún
workspace —no es código del producto y no se compila a `dist`— pero **se comprueba de tipos como todo
lo demás**: sería absurdo que el test que vigila la coherencia del proyecto fuese justo el que nadie
mira (T-086, la sesión anterior).

---

## Verificación

| Qué | Resultado |
|---|---|
| `npm test` | verde, 33 ficheros |
| `npm run vault:mutar` | **11 de 11** derivas detectadas |
| Bytes de control en el fuente | **ninguno**, repositorio entero |
| Suite E2E | 10 passed |
| `npm audit --omit=dev` | 0 vulnerabilidades |

---

## Estado

- Tareas abiertas: **0**. Bloqueadas: **0**. Problemas: **1 abierto** (P-016) · 39 cerrados.
- Migraciones publicadas: hasta la **0026**. Esta sesión no toca la base.
