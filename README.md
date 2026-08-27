# ProyectoTCG

Simulador de apertura de sobres y constructor de mazos unificado para **Magic: The Gathering**,
**Yu-Gi-Oh!** y **Pokémon TCG**, con catálogo propio alimentado desde Scryfall, YGOPRODeck y la API
de Pokémon TCG.

Un usuario puede registrarse, navegar un catálogo de los tres juegos, **abrir sobres con las
distribuciones de rareza reales** y ver su colección crecer hacia el 100 % de completitud por set.

---

## Estado

| Hito | Estado |
|---|---|
| H0 · Fundamentos | ✅ Docker Compose |
| H1 · Esquema de datos | ✅ 7 migraciones |
| H2 · Ingesta | ✅ 3 conectores + cosecha de imágenes |
| H3 · API de catálogo | ✅ Fastify, búsqueda y paginación keyset |
| H4 · Motor de sobres | ✅ Determinista y auditable |
| H5 · Frontend | ✅ Catálogo, sobres animados y colección |
| H6 · Cuentas y colección | ✅ Argon2id + JWT |
| H7 · Constructor de mazos | ✅ Motor de reglas, 6 endpoints, interfaz e import/export |
| H8 · Endurecimiento | 🟡 Suite E2E, seguridad y 6 de 8 de deuda técnica |

**341 tests + 6 recorridos E2E · `tsc --build` limpio · `npm audit` limpio.**

---

## Requisitos

Con **Docker** (Desktop o Engine + Compose v2) no hace falta nada más. Para el camino local:

- **Node.js ≥ 20** (probado con 24)
- **MySQL ≥ 8.0.17** — no es una preferencia: el esquema usa índices multivaluados sobre JSON
  (8.0.17+), `CHECK` constraints (8.0.16+) y `DEFAULT` con expresión (8.0.13+)
- **Redis** para la cuota diaria persistida de la ingesta

---

## Puesta en marcha

Hay dos caminos. **Si sólo quieres verlo funcionar, usa Docker**: es un comando y no requiere tener
MySQL ni Redis instalados.

### Camino A — Docker Compose (recomendado)

```bash
cp .env.example .env      # y pon un JWT_SECRET; ver el aviso más abajo
docker compose up --build
```

Levanta `mysql`, `redis`, `api` y `web`. **No hay ningún paso previo**: la base de datos la crea la
imagen de MySQL y las migraciones se aplican solas al arrancar la API.

- Frontend → http://localhost:5173
- API → http://localhost:3000

Para poblar el catálogo, la ingesta se lanza como una ejecución puntual:

```bash
docker compose --profile ingest run --rm --build ingest --game YGO --sets 3
```

> **El `--build` no es adorno.** `ingest` es un servicio de compose con su **propia imagen**, aunque
> comparta `Dockerfile` con `api`: reconstruir `api` no lo reconstruye. Sin `--build`, el contenedor
> corre el código de la última vez que alguien se acordó de construirlo. Ha mordido tres veces
> (S025 y dos en S028), y las tres el síntoma fue el mismo: la ingesta termina en verde y hace lo
> que hacía antes del cambio.


Detalles que evitan sorpresas:

- **MySQL se publica en el 3307**, no en el 3306: es habitual tener ya un MySQL propio ocupándolo.
  Todos los puertos son variables (`MYSQL_PORT`, `REDIS_PORT`, `API_PORT`, `WEB_PORT`).
- Cambiar `MYSQL_USER`/`MYSQL_PASSWORD` **después** del primer arranque no tiene efecto: el volumen
  `db_data` ya está inicializado. Habría que borrarlo con `docker compose down -v`.
- `./storage` se monta en los contenedores, así que las imágenes cosechadas se quedan en tu disco y
  no se vuelven a pedir al origen.

```bash
docker compose down       # parar
docker compose down -v    # parar y borrar los datos
```

### Camino B — local

```bash
npm install
npm run build
```

#### 1. Base de datos

Un solo comando: crea la base de datos si falta y aplica las migraciones pendientes. **En Docker no
hace falta**, lo hace la propia imagen de MySQL.

```bash
npm run db:migrate
```

#### 2. Entorno

Copia `.env.example` a `.env` y rellénalo. Dos avisos que no son burocracia:

- **`JWT_SECRET`** — el servidor **se niega a arrancar** si está vacío, tiene menos de 32 caracteres
  o es un valor de ejemplo. Quien conozca el secreto puede firmar un token para cualquier usuario.
  Genera uno con:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```
- **`EXTERNAL_USER_AGENT`** — Scryfall bloquea a quien no envía uno propio y descriptivo.

Las variables se leen del entorno del proceso; en Windows, `set VAR=valor` o el mecanismo que uses
habitualmente.

#### 3. Poblar el catálogo

Las migraciones se aplican solas al arrancar la API o el CLI.

```bash
# 3 sets de cada juego, con sus imágenes
npm run ingest

# sólo Yu-Gi-Oh!, 5 sets, sin descargar imágenes
npm run ingest -- --game YGO --sets 5 --no-images

# sólo cosechar imágenes pendientes
npm run ingest -- --images-only --max-images 500

# un set concreto, por su id de origen
npm run ingest -- --set khm --no-images

# devolver a la cola las imágenes que agotaron sus intentos
npm run ingest -- --images-only --retry-failed
```

Una imagen que falla se anota, y a los **tres intentos** deja de pedirse al origen: una URL
permanentemente rota se reintentaba en cada ejecución, para siempre. `--retry-failed` las reactiva
si el fallo fue una caída pasajera.

**Es seguro relanzarlo.** La ingesta es idempotente y el job de imágenes detecta las que ya están en
disco y **no vuelve a pedirlas al origen** — YGOPRODeck castiga el hotlinking con lista negra de IP.

> La ingesta completa de Magic son ~116.750 impresiones y se procesa en ~12 s desde el volcado
> comprimido de Scryfall. Lo que tarda son las **imágenes**, no los datos.

#### 4. Arrancar

```bash
npm run dev:api    # API en http://127.0.0.1:3000
npm run dev:web    # Frontend en http://localhost:5173
```

El frontend redirige `/api` y `/images` al backend en desarrollo.

---

## Estructura

```
00Master/        Contexto del proyecto: producto, stack, hitos, diccionario de datos
001Reportes/     Tareas realizadas, pendientes y bloqueadas
002Agents/       Roster de agentes y sus mandatos
003Problemas/    31 problemas registrados, con su diagnóstico y su medición
004Arquitectura/ 9 ADR, estrategia de las 3 APIs, flujos de datos, infraestructura, specs y planes
005Registro/     Bitácora de las 26 sesiones de trabajo
Claude.md        Orquestador: contrato de operación y convenciones

db/migrations/   SQL plano versionado, con migrador propio
packages/shared/ @tcg/shared — contrato de dominio compartido entre API y frontend
apps/api/        Backend: HTTP entrante, cliente saliente, ingesta, sobres, imágenes
apps/web/        Frontend: React + Vite
e2e/             Suite E2E con Playwright (ADR-009). No es workspace de npm
```

**Empieza por [`Claude.md`](Claude.md) y [`00Master/00_Contexto_Global.md`](00Master/00_Contexto_Global.md).**
Para retomar el trabajo, [`00Master/05_Continuar_Aqui.md`](00Master/05_Continuar_Aqui.md).

---

## Tres cosas que conviene saber antes de tocar nada

**1. El frontend nunca recibe una URL externa.** Las imágenes se descargan **una vez**, se
re-hospedan como WebP y se sirven desde `/images/`. YGOPRODeck castiga el hotlinking con lista negra
de IP permanente, y ese riesgo ha condicionado el diseño entero (ver `P-001` y `P-022` en
`003Problemas/`).

**2. Ninguna petición de un usuario final toca una API externa.** El catálogo local es la única
fuente de lectura (ADR-002). El tráfico de usuarios contra Scryfall sería el camino más rápido a un
bloqueo.

**3. La fidelidad de los sobres son datos, no código.** Las distribuciones viven en
`pack_templates`/`pack_slots`; afinar un sobre es un `UPDATE`, no un despliegue (ADR-005). Cada peso
sembrado lleva anotado si es `[OFICIAL]`, `[DERIVADO]` (con el cálculo) o `[ESTIMADO]`.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run build` | Compila los tres paquetes (project references) |
| `npm test` | 341 tests |
| `npm run typecheck` | `tsc --build` |
| `npm run db:migrate` | Crea la base de datos si falta y migra |
| `npm run ingest` | Pobla el catálogo y cosecha imágenes |
| `npm run dev:api` | Arranca la API (migra primero) |
| `npm run dev:web` | Arranca el frontend |
| `docker compose up --build` | Levanta el entorno completo: mysql, redis, api y web |
| `docker compose --profile ingest run --rm --build ingest` | Ingesta dentro de Docker |
| `docker compose --profile e2e run --rm e2e` | Suite E2E con Playwright |

---

## Licencia y datos de terceros

Este proyecto **no distribuye cartas ni imágenes**: las descarga en tiempo de ingesta desde las APIs
públicas de Scryfall, YGOPRODeck y Pokémon TCG, y las almacena localmente en `storage/`, que está
fuera del control de versiones.

Magic: The Gathering, Yu-Gi-Oh! y Pokémon TCG son marcas de sus respectivos propietarios. Este
proyecto no está afiliado a ninguno de ellos.
