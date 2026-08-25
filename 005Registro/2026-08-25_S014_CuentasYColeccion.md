# S014 — Cuentas y colección (H6)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sí, lanza H6"*.

## Agentes invocados
1. **Agente Seguridad** — ADR-008, hash de contraseñas y las defensas del login. Es la primera
   sesión en que este agente lleva el peso.
2. **Agente Base de Datos** — `UserRepository`, `CollectionRepository`.
3. **Agente Backend** — rutas autenticadas.
4. **Agente QA** — 22 tests de seguridad + ciclo completo real.

---

## ADR-008 — Argon2id + JWT de vida corta

**Argon2id** con los parámetros de OWASP (19 MiB, 2 iteraciones). Se usa `@node-rs/argon2` y no el
paquete `argon2`: trae binarios precompilados y no exige herramientas de compilación, que en Windows
es una fuente clásica de fricción.

**JWT y no sesión en servidor**, por coherencia con `.env.example` (que ya preveía `JWT_SECRET`) y
para no acoplar la sesión al Redis que ya está reservado para las cuotas.

**El coste está asumido y escrito:** un token robado sigue siendo válido hasta que caduca. Se mitiga
con caducidad de 1 hora. Si más adelante hace falta expulsar una cuenta comprometida al instante,
habrá que añadir una lista de revocación en Redis — no se hace ahora porque sería infraestructura
sin caso de uso.

---

## Cuatro defensas que no son opcionales

**1. El servidor se niega a arrancar con un secreto débil.** Vacío, de menos de 32 caracteres, o uno
de los valores de ejemplo (`cambiame` es literalmente lo que pone en `.env.example`). Un secreto por
defecto en producción es una cuenta de administrador regalada: quien lo conozca puede firmar un token
para cualquier usuario. Fallar al arrancar es ruidoso; un secreto por defecto es silencioso hasta que
alguien lo aprovecha.

**2. Login sin enumeración de usuarios.** Mismo mensaje, mismo código y **mismo coste temporal** tanto
si el correo no existe como si la contraseña es incorrecta. Cuando el correo no existe se verifica
igualmente contra un **hash señuelo**: sin eso, un login con correo inexistente respondería en
microsegundos y uno real tardaría lo que tarda Argon2id, y esa diferencia delata qué correos están
registrados.

**3. Límite de intentos en el login.** Argon2id encarece cada intento pero no impide probar millones.
Verificado: de 14 intentos fallidos seguidos, **7 rechazados con 429**.

**4. El `user_id` sale del token, jamás del cuerpo.** Aceptarlo del cliente sería una referencia
directa a objetos: cualquiera abriría sobres en la cuenta de otro. Hay un test que envía
`{setId, userId: 9999}` y comprueba que **ni siquiera se acepta la petición** — el esquema no declara
`userId`, así que Fastify la rechaza con 400 antes de llegar al código.

Y una quinta que salió gratis: el hash de contraseña **no puede aparecer en una respuesta**, por el
mismo mecanismo que protege `image_source_url` (ADR-007). Los esquemas no lo declaran, luego no sale.

---

## Decisiones menores con motivo

**La contraseña se mide por LONGITUD, no por composición.** Nada de "una mayúscula, un número y un
símbolo": esas reglas empujan a la gente hacia contraseñas predecibles (`Password1!`) y hoy se
consideran contraproducentes. Mínimo 10 caracteres. El **máximo** de 200 existe por otro motivo: sin
él, alguien envía 10 MB y obliga al servidor a hashearlos con Argon2id, que es una denegación de
servicio barata.

**Una apertura ajena responde 404, no 403.** Un 403 confirmaría que esa apertura existe.

**El correo se normaliza** a minúsculas y sin espacios. Sin eso, `Juan@` y `juan@` serían dos cuentas
y el usuario no entendería por qué su login "no funciona" según cómo escriba.

**El denominador de la completitud es `in_boosters = 1`.** Contar todas las impresiones haría la
completitud inalcanzable por construcción: más de la mitad del catálogo de Magic nunca sale en un
sobre (P-014). Prometerle a un coleccionista un 100 % que no puede alcanzar sería mentirle.

---

## Verificación

### Tests — 22 nuevos (196 en total)

### Ciclo completo contra MySQL real

| Fase | Resultado |
|---|---|
| Registro | 201 · correo normalizado · **el cuerpo no contiene el hash** |
| En la base de datos | `$argon2id$v=19$m=19456,t=2,p=1$...` — parámetros correctos |
| Login incorrecto vs correo inexistente | **Respuestas byte a byte idénticas** ✅ |
| Rutas protegidas sin token | 401 en las 9 |
| **Abrir 3 sobres** | 200 · cartas con nombre, rareza, foil y marca de nueva |
| Reproducir apertura ajena | **404** (el dueño: 200) |
| RN-02 | 927 copias == 927 cartas entregadas ✅ |
| 14 intentos de login fallidos | **7 rechazados con 429** ✅ |

Un detalle que confirma la lógica del motor: en el primer sobre salió *Mitsurugi Great Purification*
**dos veces**, y sólo la primera aparece marcada como NUEVA.

---

## Y una medición que eleva la severidad de P-019

Con la colección ya funcionando se abrieron **103 sobres reales** de *Supreme Darkness* y se midió la
completitud por rareza:

| Rareza | En el pool | Poseídas tras 103 sobres |
|---|---|---|
| `common` | 50 | **50** |
| `super_rare` | 26 | 25 |
| **`quarter_century_secret_rare`** | **25** | **0** |
| `ultra_rare` | 14 | 10 |
| `secret_rare` | 10 | 6 |

**Cero de 25, y no por mala suerte: la plantilla nunca las pide.** Eso pone un **techo del 80 %** a la
completitud del set.

`01_Producto.md` define al **coleccionista** como uno de los tres usuarios objetivo: *"quiere ver su
colección virtual crecer y medir su completitud por set"*. Con la plantilla actual, ese usuario **no
puede completar ningún set moderno de Yu-Gi-Oh!, jamás**, y la interfaz se lo mostraría atascado en el
80 % sin explicación.

P-019 pasa de 🟡 a 🟠. Deja de ser una imprecisión de fidelidad para ser una promesa incumplida. La
corrección sigue siendo **un `INSERT`** (T-024).

---

## Estado al cerrar
- **H1 ✅ · H2 ✅ · H3 ✅ · H4 ✅ · H6 ✅** · H0: sólo Docker · **H5 (frontend) es lo único que falta**
  para tener producto.
- Tareas: **44 realizadas · 7 pendientes · 1 bloqueada**.
- Problemas: **5 abiertos · 14 cerrados**.
- Tests: **196/196** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
**H5 (frontend).** El backend está funcionalmente completo: catálogo, cuentas, sobres y colección.
Catorce sesiones después, es la primera vez que el producto podría verse.

Antes convendría cerrar **T-024** (una migración corta): sin ella, la primera pantalla de completitud
que vea alguien mostrará un 80 % que no sube.
