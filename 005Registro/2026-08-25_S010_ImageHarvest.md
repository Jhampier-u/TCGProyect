# S010 — T-014 (`image-harvest`) · **Cierre del hito H2**
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sí, lanza T-014"*.

## Agentes invocados
1. **Agente Backend** — job de cosecha, codificador WebP y almacén de ficheros.
2. **Agente Seguridad** — auditoría de la nueva dependencia y del invariante de P-001.
3. **Agente QA** — 13 tests + cosecha real de los tres orígenes.
4. **Agente Documentador** — Vault.

---

## Por qué esta tarea era la de mayor riesgo del proyecto

YGOPRODeck no pide amablemente que no se enlacen sus imágenes: **castiga con lista negra de IP**.
Y el incumplimiento no produce un error reintentables — deja el juego inaccesible, posiblemente de
forma permanente.

Por eso el diseño no se apoya en "acordarse de no redescargar", sino en **tres salvaguardas
independientes**:

1. **Se consulta el disco antes de la red.** Si el fichero ya está, no se pide al origen — ni
   siquiera aunque la base de datos diga que falta. Ese caso (fichero sí, BD no) es exactamente lo
   que ocurre tras un reinicio a destiempo, y es cuando un job ingenuo redescargaría todo.
2. **Disco primero, base de datos después.** Al revés, un fallo de escritura dejaría una fila
   apuntando a un fichero inexistente y el catálogo se mostraría roto.
3. **Tope de descargas por ejecución** (5.000). No es una optimización: es un freno de mano. Si algo
   impidiera persistir `image_local_path`, el job se convertiría en un bucle que pide las mismas
   imágenes indefinidamente. Con tope, el peor caso está acotado.

Y el invariante *"el frontend nunca recibe una URL externa"* deja de ser una norma escrita para
convertirse en código: **`isSafeLocalPath()`** rechaza `http://`, `//cdn/`, rutas absolutas,
unidades de Windows y `..`, con un test que lo aplica a todas las rutas que el job genera.

---

## Dependencia nueva

`sharp` (libvips 8.18.3), instalada sólo en `@tcg/api`. **`npm audit`: 0 vulnerabilidades.**

Está aislada tras la interfaz `ImageEncoder`, así que el job se prueba sin ella y el codificador es
sustituible. Igual que `Clock`, `fetch` y `RedisLike`: la dependencia externa vive en una
implementación, nunca en la lógica.

---

## Verificación

### Tests — 13 nuevos (124 en total, todos verdes)
Los dos que importan: **la segunda ejecución no hace ninguna petición al origen**, y **una escritura
fallida en disco no marca la fila en base de datos**.

### Cosecha real de los tres orígenes

Muestra deliberadamente pequeña —2 imágenes por juego— porque verificar el pipeline no justifica
pedir más de lo imprescindible.

| Medición | Resultado |
|---|---|
| Primera ejecución | **6 descargadas, 0 fallidas**, 3,2 s |
| **Segunda ejecución** | **0 descargas, 6 omitidas** ← la salvaguarda funciona |
| Tamaño original | 2.102 KB |
| Tamaño WebP | 109 KB |
| **Reducción** | **94,8 %** |
| Rutas locales y relativas | 6 de 6, ninguna con `http` |
| Reintentos HTTP | 0 |

Ficheros producidos, con el saneado de rutas funcionando sobre el caso hostil de Yu-Gi-Oh!:

```
mtg/blb/mtg-forest.245.webp                  245x341  13,9 KB
ptcg/svi/sv1-8.245.webp                      245x342  21,0 KB
ygo/suda/suda-en049-secret_rare.245.webp     245x357  20,3 KB
```

Ese último venía de `external_id = "SUDA-EN049::secret_rare"`. Los dos puntos son **ilegales** en
nombres de fichero de Windows; sin saneado, la cosecha de Yu-Gi-Oh! habría fallado entera.

---

## Una estimación que estaba equivocada (por exceso)

`03_Infraestructura.md` presupuestaba ~60 KB por imagen y **6–7 GB** para el catálogo completo.
La media real medida es de **~18 KB**:

| | Estimado (S001) | Medido (S010) |
|---|---|---|
| Por imagen | ~60 KB | **~18 KB** |
| 110.000 prints | 6–7 GB | **~1,9 GB** |

El almacenamiento deja de ser un riesgo de coste. Corregido en el documento de infraestructura.

---

## Deuda registrada

**T-019.** Una URL de imagen permanentemente rota se reintenta en **cada** ejecución del job, para
siempre. Hoy no hay dónde anotar "esto falló y no va a dejar de fallar". Hará falta un
`image_failed_at` o similar antes de que la cosecha corra en producción de forma periódica.

---

## Estado del riesgo R-02

**Mitigado por completo.** Sus dos mitades están cerradas:

| Mitad | Problema | Cerrado en |
|---|---|---|
| *Ritmo de peticiones* | P-002 | S005, medido contra los orígenes reales |
| *Hotlinking de imágenes* | P-001 | S010, 0 redescargas verificadas |

---

## 🏁 Hito H2 COMPLETADO

| Pieza | Tarea | Sesión |
|---|---|---|
| `GameAdapter` + tipos de dominio | T-010 | S004 |
| `RateLimitedClient` | T-009 | S005 |
| `YgoprodeckAdapter` | T-012 | S006 |
| `ScryfallAdapter` | T-011 | S007 |
| `PokemonTcgAdapter` + `RedisQuotaStore` | T-013, T-017 | S009 |
| `image-harvest` | T-014 | S010 |

**Todos verificados contra los orígenes reales**, no sólo con dobles de prueba.

Queda por construir el **orquestador de ingesta** que una las piezas (leer sets → upsert →
`sets.ingested_at` → encolar imágenes). No se ha creado tarea porque depende de **ADR-006**: sin
decidir ORM/migrador no hay capa de persistencia que escribir.

---

## Estado al cerrar
- **H1 ✅ · H2 ✅** · H0 sólo necesita Docker (T-004).
- Tareas: **28 realizadas · 5 pendientes · 1 bloqueada**.
- Problemas: **4 abiertos · 11 cerrados**.
- Tests: **124/124** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
Con la ingesta cerrada, el camino natural es **H4 (motor de sobres)**, que ya tiene todo lo que
necesita: pool filtrado por `in_boosters`, plantillas sembradas e índice covering. Alternativamente
**T-004 (Docker)** cierra H0, o **ADR-006** desbloquea el orquestador de ingesta.
