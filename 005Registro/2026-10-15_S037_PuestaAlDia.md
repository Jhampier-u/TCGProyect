# S037 — Puesta al día del Vault, y el resto de H9b

**Fecha:** 2026-10-15 · **Tareas:** T-096 (y H9b: T-093, T-094, T-095)

---

## Lo que el Vault decía y ya no era verdad

La sesión empezó con una pregunta —*«dime el estado del proyecto»*— y la respuesta honesta tuvo que
incluir que el punto de entrada estaba desfasado:

- `05_Continuar_Aqui.md` decía *«tras la sesión S032»* y listaba T-091 y T-092 como siguientes, con
  las dos ya hechas y en `main`.
- `Tareas_Realizadas.md` atribuía T-091 a **S035** y T-092 a **S036**, y en `005Registro/` no había
  ni una ni otra. `Claude.md` seguía en *«última sesión S034»*.
- El README seguía con H8 *«🟡 6 de 8»*, cerrado desde S028, y sin fila para H9.

**La comprobación del Vault estaba en verde con todo eso.** Mira que el mapa de `Claude.md` liste lo
que hay en `005Registro/`, pero no que exista la bitácora de una sesión que se cita; de un fichero que
no existe no hay nada que mirar. Se añade la comprobación en el otro sentido —toda sesión que cierra
una tarea tiene bitácora, y el mapa no nombra ninguna que no esté en disco— y **se vio fallar** antes
de darla por buena: ocultando S035 la señala, igual que señalaba S037 hasta escribir este fichero.

Las dos bitácoras se **reconstruyeron** de los commits `4e1ff60` y `361c879`, que traen mensajes
largos y medidos, y lo dicen en su cabecera. No se inventa nada que no esté en ellos.

---

## T-096 — `npm audit` había dejado de estar limpio sin que nada cambiara (P-041)

En esta máquina no había `node_modules`. `npm ci` con el lockfile de agosto informó de **7
vulnerabilidades, 5 altas**: `fastify` (entre ellas un *bypass* de autenticación), `fast-jwt`
(acepta JWT caducados sin `iat`), `sharp`, `fast-uri`, `ip-address`, `brace-expansion`,
`source-map-js`.

Nadie había tocado una dependencia: **se publicaron avisos nuevos contra las versiones fijadas**. La
regla de P-011 se comprueba al cerrar tareas que tocan dependencias, y un proyecto parado no cierra
ninguna. `npm audit fix` sin `--force` lo resuelve dentro de los rangos declarados; sólo cambia el
lockfile, y la suite sigue en 481/481.

**Otra cosa que el retorno destapó:** `e2e/` no es workspace, así que `npm ci` en la raíz no le
instala `@playwright/test` y `npm test` **no compila** —el type-check de T-086 incluye
`e2e/tsconfig.json`—. `05_Continuar_Aqui.md` lo dice ahora en el arranque local.
