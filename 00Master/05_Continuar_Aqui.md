# 05 — Continuar aquí

**Punto de guardado:** 2026-08-26, tras la sesión **S028**
**Commit:** rama `main` · 385 tests de Vitest + 10 recorridos E2E en verde · `npm audit` limpio

Este documento existe para retomar el proyecto en otra máquina o en otra sesión sin releer las 26
bitácoras. Si sólo vas a leer un fichero, que sea éste.

---

## 1. Qué es y en qué punto está

Simulador de apertura de sobres + constructor de mazos para MTG, Yu-Gi-Oh! y Pokémon TCG.

**Funciona hoy, de punta a punta:** un usuario se registra, navega el catálogo de los tres juegos,
abre sobres con las distribuciones reales y con revelado animado carta a carta, y ve su colección
crecer con completitud por set.

| Hito | Estado |
|---|---|
| H0 Fundamentos | ✅ **cerrado en S019** — Docker Compose (T-004) |
| H1 Esquema · H2 Ingesta · H3 API · H4 Sobres · H5 Frontend · H6 Cuentas | ✅ |
| **H7 Constructor de mazos** | ✅ **cerrado en S022** — motor, API, interfaz e import/export |
| **H8 Endurecimiento** | ✅ **cerrado en S028** — suite E2E, seguridad y las ocho de deuda técnica |

---

## 2. Lo primero al llegar a una máquina nueva

Desde S019 hay un camino de un comando. Es el recomendado:

```bash
cp .env.example .env      # rellenar JWT_SECRET; ver README
docker compose up --build
docker compose --profile ingest run --rm ingest --game YGO --sets 2
```

Frontend en http://localhost:5173, API en http://localhost:3000. **MySQL se publica en el 3307**
para no chocar con el MySQL que suele haber instalado en el 3306.

El camino local sigue existiendo y es el que conviene para desarrollar con el depurador:

```bash
npm install && npm run build
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS proyecto_tcg CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
cp .env.example .env
npm run ingest -- --game YGO --sets 2
npm run dev:api           # y en otra terminal: npm run dev:web
```

**No hay que hacer nada con las migraciones**: se aplican solas al arrancar la API o el CLI. Y en
Docker tampoco hay que crear la base de datos: la crea la imagen de MySQL.

`storage/` **no viaja en el repositorio** (son GB de imágenes). En una máquina nueva estará vacío y
el CLI las descargará. Si vienes de una máquina donde ya estaban, cópialas: el job detecta las que ya
existen y no vuelve a pedirlas al origen.

---

## 3. Las decisiones que no hay que reabrir

Los **ocho ADR** están cerrados y documentados en `004Arquitectura/00_ADR.md`. Los que más
condicionan el día a día:

| ADR | Decisión | Por qué importa |
|---|---|---|
| **002** | El catálogo local es la única fuente de lectura | Ninguna petición de usuario toca una API externa. Jamás. |
| **003** | Capa anticorrupción con `GameAdapter` | Añadir un 4.º juego = escribir un adaptador |
| **005** | Los sobres son **datos**, no código | Afinar la fidelidad es un `UPDATE` |
| **006** | `mysql2` + SQL plano, **sin ORM** | Ningún ORM modela generadas, MVI ni FULLTEXT |
| **007** | Fastify | Su serialización por esquema **impide** filtrar campos |
| **008** | Argon2id + JWT de 1 h | El token no se puede revocar; por eso caduca pronto |

---

## 4. Ocho cosas que se rompen en silencio

Esto es lo que de verdad hay que interiorizar antes de tocar código.

### 4.1 El frontend nunca recibe una URL externa (P-001, P-022)
YGOPRODeck castiga el hotlinking con **lista negra de IP permanente**. Las imágenes se descargan una
vez y se re-hospedan. `isSafeLocalPath()` lo comprueba y los esquemas de Fastify eliminan lo no
declarado.

**Pero ojo:** en S016 se filtraron 1032 URLs por exponer `sets.icon_url`. El esquema sólo protege de
lo que **no** declaras; si declaras el campo equivocado, sale. Y el test que debía detectarlo pasaba
en vacío porque la fixture devolvía `null`.

Desde S027 los iconos de set también están re-hospedados y la API expone `iconPath`, una ruta
**local**. `icon_url` sigue sin salir. Lo mismo que con las cartas: si necesitas enseñar una imagen,
cosecha primero.

### 4.2 Las claves naturales que "parecen" únicas
**Cinco problemas del proyecto** han sido de esta familia (P-009, P-010, P-013, P-015, P-017). El
patrón siempre es el mismo: una clave que parece identificar una fila, un `ON DUPLICATE KEY UPDATE`,
y datos que desaparecen sin un solo error en los logs.

- `Nidoran♂` y `Nidoran♀` colapsaban en la misma carta
- `set_code` de YGO se repite dentro de un set **y** entre sets (`JUMP` en 70 sets)
- En Pokémon hay 258 cartas y **175 nombres**: el nombre no identifica una carta
- Los nombres de set de YGO llegan a 85 caracteres

**Antes de elegir una clave natural, cuéntala.**

### 4.3 Una salvaguarda puede no hacer nada
En S023 se fijó `reducedMotion` en la configuración de Playwright para que el test del volteo no
pasara en falso. Estaba escrito en el spec, defendido en el plan y comentado con tres líneas. **No
llegaba al navegador**: medido en la misma ejecución daba `false` desde el config y `true` creando
el contexto a mano (P-029). El test pasaba porque el valor por defecto coincidía con el deseado.

Se descubrió sólo porque el plan **obligaba a romperlo a propósito** y verlo en rojo. Una salvaguarda
en la que se confía y que no hace nada es peor que no tenerla.

### 4.4 Hay defectos que sólo ve un ojo
El editor de mazos se verificó dos sesiones por DOM y por panel de red, y todo cuadraba: los
elementos existían, los conteos eran correctos, la validación respondía. La primera captura enseñó
el selector de sets **solapando** el panel del mazo, 614 px dentro de una columna de 530 (P-030).

Verificar por DOM es necesario y no es suficiente.

### 4.5 La clave por la que agrupas no es la que crees
RN-04 cuenta las copias **por nombre**. El motor agrupaba por `oracle_key`, que en Magic y Yu-Gi-Oh!
equivale al nombre pero en Pokémon es **una clave por impresión**: 775 nombres en 1279 filas. El
resultado, medido, era que 16 copias de la misma carta pasaban como mazo legal (P-027).

No se vio durante dos sesiones porque las cartas de Pokémon se ingestaron **después** de escribir el
validador, y los tests usaban claves inventadas, todas distintas.

### 4.6 Un spec puede prometer algo que el código no hace
En S021 el spec decía que el detalle de una carta se cachearía y sólo se pediría una vez. El código
llamaba a la API directamente, sin pasar por la caché. Compilaba, pasaba los tests y se leía bien.
**Lo único que lo destapó fue mirar el panel de red** (P-026).

Del mismo día: la imagen web de Docker llevaba **dos sesiones rota** sin que nadie lo notara, porque
hasta entonces el frontend sólo importaba *tipos* de `@tcg/shared` — que se borran al compilar— y el
módulo nunca se cargaba (P-025).

### 4.7 Un test sólo vale si lo has visto fallar
En S020 el test que debía blindar P-024 fue **vacuo dos veces seguidas**: la primera porque el doble
sustituía justo a la función bajo prueba, y la segunda porque `tsc` **excluye los ficheros de test**
y la anotación de tipo no la comprobaba nadie. Sólo el tercero, que ejecuta la función de verdad,
falló al reintroducir el bug.

Es la misma familia que P-022, donde el test pasaba porque la fixture devolvía `null`. **Antes de
dar un test por bueno, rómpelo a propósito y compruébalo.**

### 4.8 Los bugs que sólo aparecen a escala
Once veces ha pasado (P-017, P-020, P-022, P-023, P-024, P-025, P-026, P-027, P-028, P-029, P-030): probar con una muestra elegida a mano **no
ejercita el mismo camino** que procesar el catálogo entero, arrancar el servidor de verdad o
levantar los contenedores. Los dobles de prueba
son útiles para la lógica, pero **la fidelidad de sus datos determina lo que el test puede detectar**.

---

## 5. Lo que está pendiente, por orden de interés

### El siguiente paso natural
**Los ocho hitos están cerrados** y no queda nada bloqueante. Lo único abierto del proyecto es una tarea de
producto, y tiene una decisión detrás que conviene tomar antes de teclear:

- **T-073** — la fidelidad de *Black Bolt* / *White Flare*. Tienen el 40 % del set en Illustration
  Rare y su plantilla les da el 10,2 %. Todas sus cartas son alcanzables; lo que falta es que el
  sobre se parezca al producto, y para eso hacen falta tasas que nadie publica. Es lo único que queda
  y es ⚪ con motivo.

**Cómo se ejecuta la suite:**

```bash
docker compose --profile ingest run --rm ingest --game YGO --sets 4   # sólo si falta catálogo
docker compose --profile e2e run --rm e2e
```

La suite **no ingesta**: comprueba su precondición y se detiene diciendo el comando exacto. Atarla a
tres APIs de terceros la haría fallar por motivos ajenos.

### Deuda con impacto medido — **la lista está vacía desde S028**

Las ocho tareas de H8c están cerradas. Lo que queda abierto salió de hacerlas, y está abajo.

| Tarea | Qué pasa si no se hace |
|---|---|
| **T-073** | *Black Bolt* y *White Flare*: 40 % del set en Illustration Rare, la plantilla les da el 10,2 % |

### Bloqueada por ti
**Nada.** T-005 se cerró en S028: la clave de Pokémon está puesta en `.env` y verificada.

---

## 6. Problemas abiertos que conviene tener presentes

| ID | Severidad | Resumen |
|---|---|---|
| **P-003** | 🟠 | Residuo: 3 limitaciones de las plantillas de sobre (ver P-008) |
| **P-008** | 🟡 | "The List" de MTG no se modela; el slot de tierra no filtra por tipo |
| **P-016** | 🟠 | La API de Pokémon responde 200 sólo ~30 % de las veces. La ingesta **debe** poder reanudarse |

Los 38 problemas —33 cerrados, con su medición— están en `003Problemas/Registro_Problemas.md`.

**P-021 se cerró en S028, y su entrada es la que más conviene leer**: llevaba trece sesiones citada
en cinco documentos sin estar escrita, y al medirla resultó ser lo contrario de lo que decía la
ficha. Después están **P-034** —la misma familia en Pokémon, encontrada por la comprobación que se
escribió para Yu-Gi-Oh!—, **P-035**, un rollback que dejaba la base a medias, y sobre todo **P-038**:
el tope global de peticiones llevaba desde H3 sin cubrir **ninguna** ruta del catálogo, porque un
plugin de Fastify sólo afecta a lo que se declara después de él. Estaba escrito, revisado y
comentado; lo que no estaba era medido.

---

## 7. Cómo se trabaja aquí

El contrato está en `Claude.md`. Lo esencial:

1. Cada requerimiento se descompone e invoca a los agentes de `002Agents/`.
2. **Nada se da por bueno sin ejecutarlo.** El patrón de las 17 sesiones ha sido: escribir, y después
   verificar contra MySQL real, APIs reales o un navegador real. Casi todos los problemas graves han
   salido de ahí, no de la revisión.
3. El **Agente Documentador** actualiza el Vault al final de cada interacción, y la respuesta cierra
   con un bloque mostrando qué ficheros cambiaron.

**Convenciones que ya han costado un error cada una:**
- Las migraciones publicadas son **inmutables**. En S015 se editó un comentario de la `0003` y se
  revirtió: la regla existe para no razonar "es sólo un cambio pequeño".
- El código fuente se mantiene en **ASCII puro**; los caracteres no-ASCII se construyen con
  `String.fromCharCode` o propiedades Unicode.
- **`npm audit` limpio** es criterio de aceptación de toda tarea que toque dependencias.
- Todo **estado incremental** (`*.tsbuildinfo`, `dist/`) se excluye del contexto de build de Docker
  de forma **recursiva** (`**/`). En S019 un `tsconfig.tsbuildinfo` colado desde el host convenció a
  `tsc` de que ya estaba todo compilado: la imagen salió sin `dist/` y el build terminó en verde
  (P-023).

---

## 8. Notas de entorno (Windows)

- **Docker Desktop** está instalado (Docker 29.5.3 · Compose v5.1.4) pero no arranca solo: si
  `docker info` falla, `docker desktop start`.
- MySQL 8.0.42 en `C:\Program Files\MySQL\MySQL Server 8.0`. Para verificar sin tocar la instancia
  del usuario, las sesiones han levantado instancias temporales con `mysqld --initialize-insecure`
  en un datadir aparte y puerto 3399.
- Los inputs de React son **controlados**: rellenarlos por automatización exige el *setter* nativo de
  `HTMLInputElement` más un evento `input`. Escribir en `.value` no lo ve React. Relevante para los
  Cypress de H8.
