# S019 — Docker Compose: el entorno completo en un comando (T-004)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Revisa el estado del proyecto y continúa."*

`00Master/05_Continuar_Aqui.md` señalaba **T-004** como el siguiente paso natural: es lo único que
falta para cerrar **H0**, es corto, y H7 (constructor de mazos) se desarrollará más cómodo con el
entorno levantándose solo. Se acometió T-004.

## Punto de partida verificado, no supuesto

La máquina no tenía `node_modules`: el repositorio estaba tal cual se clona. Antes de tocar nada:

| Comprobación | Resultado |
|---|---|
| `npm install` | 177 paquetes · **0 vulnerabilidades** |
| `npm run build` | limpio |
| `npm test` | **202/202** |
| Árbol de git | limpio en `main` |

## Lo que se ha construido

| Fichero | Qué hace |
|---|---|
| `docker/Dockerfile` | 4 etapas: `deps` (compartida) → `api-build` → `api` y `web` |
| `docker-compose.yml` | `mysql`, `redis`, `api`, `web` + perfil `ingest` |
| `.dockerignore` | Recorta el contexto de build |
| `.env.example` | Ampliado con el bloque de Docker; sirve para los dos modos de arranque |
| `apps/web/vite.config.ts` | Destino del proxy configurable por entorno |
| `apps/api/src/index.ts` | Crea `STORAGE_PATH` al arrancar si no existe |

```bash
docker compose up --build                                             # todo el entorno
docker compose --profile ingest run --rm ingest --game YGO --sets 3   # poblar el catálogo
```

**No queda ningún paso manual previo.** La base de datos la crea la imagen de MySQL
(`MYSQL_DATABASE`) y las migraciones se aplican solas al arrancar la API. Esto **cierra también el
motivo de T-022** para el camino de Docker; T-022 sigue abierta para el arranque local.

## Cuatro decisiones que no son cosméticas

**1. Debian y no Alpine.** `sharp` y `@node-rs/argon2` son módulos nativos. Sus binarios para musl
son un camino conocido de fallos en tiempo de arranque, y aquí el tamaño de imagen no compensa el
riesgo. Se comprobó antes que el `package-lock.json` —generado en Windows— **sí contiene** las
variantes `linux-x64` de sharp, argon2 y rolldown, así que `npm ci` resuelve dentro del contenedor.

**2. MySQL se publica en 3307, no en 3306.** La máquina de desarrollo ya tiene MySQL 8.0.42
instalado ocupando el 3306; publicar ahí habría fallado al arrancar el contenedor. Todos los puertos
son variables (`MYSQL_PORT`, `REDIS_PORT`, `API_PORT`, `WEB_PORT`).

**3. El healthcheck de MySQL exige TCP.** Durante la inicialización, el *entrypoint* de la imagen
oficial levanta el servidor con `--skip-networking`. Un `mysqladmin ping` por socket daría "sano"
mientras la base todavía no acepta conexiones, y la API arrancaría contra una puerta cerrada. Con
`--protocol=tcp` el estado sano significa lo que debe significar.

**4. `JWT_SECRET` no tiene valor por defecto.** Compose se niega a arrancar si falta, igual que se
niega el servidor (ADR-008). El resto de valores de desarrollo sí están a la vista a propósito.

## P-023 — La imagen se construía sin `dist/` y sin un solo error

El primer `docker compose up` dejó la API en bucle de reinicio:

```
Error: Cannot find module '/app/apps/api/dist/index.js'
```

El build había terminado en verde. Dentro de la imagen estaban `src/`, `package.json` y
**`tsconfig.tsbuildinfo`** — pero no `dist/`.

**Causa.** Los patrones de `.dockerignore` no son recursivos si no llevan `**/`. `**/dist` sí tapaba
`apps/api/dist`, pero `*.tsbuildinfo` sólo tapaba la raíz: el `tsconfig.tsbuildinfo` del host se
coló en el contexto, `tsc --build` lo leyó, concluyó que **ya estaba todo compilado** y no emitió
nada. Salida cero, imagen sin código.

**Solución.** `**/*.tsbuildinfo` en `.dockerignore`.

**Por qué merece un número de problema.** Es la cuarta vez en el proyecto que un fallo sólo aparece
al ejecutar de verdad (P-017 a escala, P-020 recorriendo el catálogo, P-022 arrancando el servidor,
y éste levantando los contenedores). Y comparte familia con ellos: *el paso silencioso*. `tsc` no
avisa de que ha decidido no compilar; un build incremental con un estado heredado que no le
corresponde es indistinguible de un build correcto salvo por lo que falta al final.

## Un aviso menor que también se arregló

Con `storage/` vacío en una máquina recién clonada, `@fastify/static` avisaba:

```
"root" path "/app/storage/cards" must exist
```

El servidor arrancaba igual, pero `/images` habría devuelto 404 hasta la primera ingesta, y el aviso
se pierde entre los logs de arranque. `index.ts` crea ahora el directorio antes de registrar el
plugin. Vale para Docker y para el arranque local.

## Verificación — contra los contenedores reales, no contra el fichero

| Comprobación | Resultado |
|---|---|
| `docker compose config` | Válido |
| `docker compose build` | api 468 MB · web 728 MB |
| `docker compose up -d` | mysql *healthy* · redis *healthy* · api *healthy* · web arriba |
| Migraciones | **Las 6 aplicadas solas** al arrancar la API |
| `GET :3000/api/health` | `{"status":"ok"}` |
| `GET :3000/api/games` | Los 3 juegos sembrados |
| Proxy del frontend | `:5173/api/games` → **200** a través de la red de compose |
| Perfil `ingest` | *Magnificent Maestros*: **66 impresiones** · 1032 sets descubiertos · 0 fallidos |
| Catálogo en el navegador | Cartas, sets y las 22 rarezas de YGO renderizadas desde `:5173` |
| `npm run build` · `npm test` tras el cambio de `index.ts` | Limpio · **202/202** |
| `npm audit` | 0 vulnerabilidades |

El recorrido completo —navegador → contenedor `web` → proxy → contenedor `api` → contenedor
`mysql`— quedó ejercitado con datos ingestados por el propio perfil `ingest`.

## Divergencia deliberada con `004Arquitectura/03_Infraestructura.md`

El documento preveía un servicio `worker` permanente para los jobs de ingesta e imágenes. No existe
tal worker: la ingesta es un **CLI que termina** (T-041). Modelarlo como servicio siempre encendido
sería inventar un proceso que el código no tiene. Se ha modelado como perfil de compose, que es lo
que de verdad es. El documento de infraestructura queda actualizado con la topología real.

## Estado
- **H0 CERRADO.** Sólo queda T-005 (API key de Pokémon), que es tuya, no del proyecto.
- Siguiente épica: **H7 — Constructor de mazos**.
