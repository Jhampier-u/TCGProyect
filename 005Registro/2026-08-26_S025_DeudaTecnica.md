# S025 — Deuda técnica: cinco de ocho (H8c)
**Fecha:** 2026-08-26 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Dale, resuelve y sigue."*

Tercer sub-proyecto de H8: ocho tareas independientes acumuladas desde S004. **Se han cerrado
cinco.** Las tres que quedan están dichas abajo con su motivo, no escondidas.

## T-023 — el orden de la ingesta

**La primera medición me habría llevado al error.** En Yu-Gi-Oh! había **cero** sets en el futuro, y
los ocho primeros del orden actual eran sets reales de 27 a 150 cartas: la premisa de la tarea
parecía caducada. Al mirar los otros dos juegos apareció lo que la tarea describía:

```
MTG, primeros del orden actual:
  2026-11-13     41  Star Trek Commander
  2026-11-13      1  Star Trek Tokens      <- un set de UNA carta
  2026-10-02      2  Reality Fracture Commander
```

Seis sets sin publicar, y una ejecución acotada se los llevaba antes que nada. **Eso explica algo de
S020 que no cuestioné:** la ingesta de Magic reportó `sds: 1 impresiones` y lo di por bueno.

`findPendingSets` excluye ahora lo no publicado. Los sets sin fecha **sí** entran y quedan los
últimos —en MySQL un `DESC` ordena los NULL al final—, porque excluirlos les cerraría la puerta para
siempre.

Verificado de punta a punta: el mismo comando pasa de 122 impresiones de producto sin salir a **494
de `The Hobbit`** y compañía.

## Un tropiezo que conviene recordar

El primer intento tras el arreglo siguió trayendo los sets futuros. La causa: **`ingest` es un
servicio de compose con su propia imagen**, aunque comparta Dockerfile con `api`. Reconstruir `api`
no reconstruye `ingest`.

## T-050 — los dos predicados, medidos por fin

Llevaba tres sesiones bloqueada, y no por falta de ganas: **el CLI no sabía pedir un set concreto**, y
los sets que contienen los casos que faltaban están decenas de posiciones abajo en un orden por
fecha. Llegar a ellos eran ~7.000 impresiones contra una API que responde el 30 % de las veces
(P-016).

Se añadió `--set`, que ingesta sets concretos ignorando el orden y el marcador de ya ingestado. Con
eso:

**Pokémon** (`--set sve`, *Scarlet & Violet Energies*):

```
29 cartas de Energia · 16 BASICAS (sin limite) · 13 ESPECIALES (limite 4)
```

**Magic** (`--set khm`, *Kaldheim*), sobre **346** `type_line` reales:

```
SIN LIMITE (supertipo Basic): 10
   Basic Land - Forest ... Basic Snow Land - Swamp
con "Snow" pero LIMITADAS a 4: 32
   Snow Land - Forest Island, Legendary Snow Creature - Troll Warrior, ...
```

Las nevadas **básicas** sin límite y las nevadas **duales** limitadas a 4. Los dos lados del
predicado, con datos reales. **T-050 cerrada.**

## T-016 — la deriva que nadie vigilaba

La correspondencia 1=MTG, 2=YGO, 3=PTCG vive en `packages/shared` y en el seed `0002`. Cambiar uno
sin el otro **no habría fallado al arrancar**: las consultas seguirían ejecutándose contra el
`game_id` equivocado y devolverían las cartas de otro juego.

El test lee el fichero de migración —inmutable una vez publicado— y compara. **Verificado moviendo
YGO al 7 y viéndolo en rojo.**

## T-061 — tres filas idénticas

Salió de mirar las capturas de S023: tres impresiones de la misma carta se veían iguales en el
buscador porque la fila no mostraba la rareza. Ahora:

```
Link Effect Monster · MAMO 038 · secret rare
Link Effect Monster · MAMO 038 · starlight rare
Link Effect Monster · MAMO 038 · ultra rare
```

## T-022 — y P-032, que salió de probarlo

`npm run db:migrate` crea la base si falta y migra. Quita el último paso manual del arranque local.

**Probándolo contra una base vacía apareció P-032.** La migración `0001` lleva dentro
`USE proyecto_tcg;`, así que **el migrador se cambia de base solo**, diga lo que diga la conexión:

```
Base de datos "tcg_prueba_t022" lista.
Table 'games' already exists          <- creando en proyecto_tcg
```

Apuntar a otra base y migrar crearía las tablas en `proyecto_tcg` **mientras anota la migración como
aplicada en la otra**. Dos bases inconsistentes, en silencio. Aquí no se rompió nada sólo porque las
tablas ya existían y la migración abortó.

Las migraciones publicadas son inmutables, así que `0001` no se toca. El script lee el nombre que
fija y **se niega a arrancar** contra otro, nombrando el problema en el mensaje.

## Lo que queda de H8c, y por qué

| ID | Por qué no se ha hecho |
|---|---|
| **T-019** | `card_prints.image_failed_at`: una URL rota se reintenta para siempre. Necesita migración nueva y tocar el cosechador. Es trabajo real, no un retoque |
| **T-035** | Cosechar los iconos de set. Alcance parecido: descarga, conversión y exposición por la API |
| **T-034** | Plantillas por época para los sets de Yu-Gi-Oh! anteriores a 2020. Es la mayor de las ocho y sigue en ⚪: necesita un paso de asignación posterior a la ingesta |

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm test` | **339/339** en 26 ficheros |
| Suite E2E | 6 passed |
| `tsc --build` · `vite build` · `npm audit` | limpios |

## Estado
- **H8c a medias, y dicho:** cinco de ocho. Quedan T-019, T-034 y T-035.
- H8a y H8b hechos.
