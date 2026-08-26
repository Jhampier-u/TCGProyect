# 12 — Spec y plan de H8b · Seguridad (segundo sub-proyecto de H8)

**Fecha:** 2026-08-26 · **Sesión:** S024 · **Estado:** aprobado por el usuario

**Desviación deliberada del ciclo:** spec y plan van en un solo documento. H8b son dos tareas
acotadas, sin decisiones abiertas y sin diseño que explorar; separarlo en dos ficheros sería
ceremonia. H8a y H7 sí llevaron los dos, porque tenían elección de herramienta y de arquitectura.

---

## 1. Qué se construye

| ID | Tarea |
|---|---|
| **T-051** | La autenticación pasa a comprobarse **antes** que el esquema del cuerpo |
| **T-062** | Límites de tasa **por ruta**, en las cuatro que hoy están desprotegidas |

---

## 2. T-051 — 401 antes que 400

### El problema

Hoy `requireUser` se llama **dentro** de cada manejador. El ciclo de vida de Fastify es
`onRequest → preParsing → preValidation → validación → preHandler → manejador`, así que el esquema
del cuerpo se valida **antes** de que nadie mire el token:

```
POST /api/decks  (sin token, cuerpo vacío)  ->  400, no 401
```

Un cliente anónimo puede así descubrir la forma del cuerpo de cualquier ruta. La superficie es
pequeña —es API pública— pero el orden correcto es el otro: **primero quién eres, después qué
mandas.** Quedó registrado con su test en S021 y se arregla aquí.

### La corrección

`requireUser` deja de ser una función que se llama en el manejador y pasa a ser un **hook de
`preValidation`** que deja el usuario en `request.usuario`.

- **Rutas de mazos:** las seis son autenticadas, así que el hook se registra una vez en un **ámbito
  encapsulado** (`app.register(async (scope) => { scope.addHook(...) })`). Sin encapsular, el hook
  se aplicaría a todo el servidor, incluidos el catálogo público y el propio login.
- **Rutas de cuenta:** `register` y `login` son públicas; las otras seis llevan el hook **por ruta**.

Los manejadores dejan de repetir `const user = await requireUser(...); if (!user) return;` y leen
`request.usuario.id`. Menos ruido y un sitio menos donde olvidarse.

### Cómo se comprueba que funciona

El test que hoy afirma lo contrario —`el esquema del cuerpo se valida ANTES que el token (400, no
401)`— **se invierte**: pasa a exigir 401. Que ese test cambie de signo es la prueba de que el
arreglo hace algo.

---

## 3. T-062 — límites por ruta

### Lo que hay hoy

| Ámbito | Límite |
|---|---|
| Global | 300 por minuto |
| `POST /api/auth/login` | 10 por 5 minutos |

Todo lo demás sólo tiene el tope global. **Y ahí hay un hueco real:**

`POST /api/auth/register` no tiene límite propio, y cada registro paga un hash **Argon2id** con los
parámetros de OWASP: 19 MiB de memoria y 2 iteraciones. Trescientos registros por minuto son 300
hashes de 19 MiB. Es una denegación de servicio barata contra el recurso más caro del servidor, y el
tope global la permite de sobra.

### Los límites nuevos

| Ruta | Límite | Por qué |
|---|---|---|
| `POST /api/auth/register` | **20 / hora** | Cada uno cuesta un Argon2id de 19 MiB. Ver abajo por qué 20 y no 5 |
| `POST /api/packs/open` | **30 / minuto** | Abre hasta 24 sobres por petición: escribe en `pack_openings`, `pack_opening_cards` y `user_collection` |
| `PUT /api/decks/:id/cards` | **60 / minuto** | Hasta 400 filas por petición, en transacción |
| `POST /api/decks/resolve` | **30 / minuto** | Hasta 400 líneas resueltas contra el catálogo |

El tope global de 300/min se queda como última línea.

### Por qué 20 registros por hora y no 5

El primer borrador puso 5. Es demasiado estrecho, y por un motivo que no tiene que ver con los
tests: **hay IPs compartidas de sobra** — un aula, una oficina, una red móvil con NAT. Cinco cuentas
por hora dejaría fuera a gente legítima con bastante facilidad.

Veinte sigue reduciendo la superficie del ataque **unas 900 veces** frente a lo que hay hoy: el tope
global permite 300 por minuto, o sea 18.000 por hora, cada uno pagando un Argon2id de 19 MiB.

Se dice también lo otro, porque conviene que conste: con 5 la suite E2E no cabría, ya que crea un
usuario por test desde la misma IP. **Eso no es lo que decide el número** —bajar una defensa para
que pasen los tests es hacerlo al revés—, pero fue lo que obligó a mirarlo con cuidado en vez de
elegir una cifra bonita.

### Dos decisiones dichas en voz alta

**Los límites son por IP, no por usuario.** El limitador corre en `onRequest`, antes de que el token
se verifique, así que no puede saber quién pide. Moverlo después obligaría a analizar el cuerpo
antes de rechazar, que es justo lo que un límite de tasa debe evitar. Por IP es la primera línea
estándar y es lo que corresponde aquí.

**El contador vive en memoria, no en Redis.** Hoy el API corre en **un solo contenedor** y no tiene
cliente de Redis conectado: `RedisQuotaStore` existe para la ingesta y el servidor nunca lo
instancia. Añadirlo sería infraestructura sin caso de uso — lo mismo que ADR-008 rechazó para la
revocación de tokens.

**Lo que hay que cambiar el día que haya más de una instancia:** con N réplicas, cada una cuenta por
su cuenta y el límite efectivo pasa a ser N veces el configurado. Ese día hay que conectar
`@fastify/rate-limit` a un almacén compartido. Queda escrito para que se decida entonces y no se
descubra por sorpresa.

---

## 4. Verificación

- El test de S021 invertido: `POST` anónimo con cuerpo inválido responde **401**, no 400.
- Un test por cada límite nuevo: agotar el cupo y comprobar **429**, y que la cabecera
  `retry-after` viene informada.
- El límite de registro comprobado **antes** de que el cuerpo se valide: un registro anónimo de más
  no debe llegar a pagar un Argon2id.
- La suite E2E sigue en verde: el recorrido de humo crea usuarios, así que un límite mal puesto la
  rompería.
- `tsc --build`, Vitest, `vite build` y `npm audit` limpios.

---

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| El hook encapsulado se escapa de ámbito y protege el catálogo público | Test que comprueba que `GET /api/games` sigue respondiendo **sin** token |
| El límite de registro deja fuera a usuarios legítimos con IP compartida | Por eso son 20 y no 5, razonado arriba. La suite E2E, que crea un usuario por test, sirve además de canario: si no cabe, el número es sospechoso |
| Un límite mal puesto deja fuera a un usuario legítimo | Los cuatro son holgados para uso humano y estrechos para un script |
