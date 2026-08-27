# 10 — Spec H8a · Suite E2E (primer sub-proyecto de H8)

**Fecha:** 2026-08-26 · **Sesión:** S023 · **Estado:** aprobado por el usuario, pendiente de plan

H8 son tres sub-proyectos independientes. Éste es el primero.

| Sub-proyecto | Estado |
|---|---|
| **H8a — Suite E2E** | **este spec** |
| H8b — Seguridad: T-051, rate limiting por ruta y por usuario | pendiente |
| H8c — Deuda técnica: T-016, T-019, T-022, T-023, T-034, T-035, T-050 | pendiente |

Se empieza por H8a porque **dos tareas abiertas están bloqueadas exactamente por lo que aporta**:
T-040 desde S017 y T-053 desde S021, las dos por no haber tenido nunca un navegador que pinte.

---

## 1. ADR-009 — Playwright en lugar de Cypress

El criterio de H8 dice "suite Cypress verde" desde **S001**, cuando el proyecto no tenía monorepo ni
contenedores. Hoy todo corre en Docker (T-004) y esa decisión conviene revisarla en voz alta.

| | Playwright | Cypress |
|---|---|---|
| Headless | Por defecto | Necesita su Electron o un display |
| Docker | Imagen oficial mantenida | `cypress/included`, ~1,5 GB |
| Navegadores | `playwright install` los fija de forma determinista | Ligados a la versión del paquete |
| Modelo | Controla el navegador desde fuera | Corre **dentro** de la página |
| TypeScript | Nativo | Con configuración añadida |

Se elige **Playwright**. Lo que más pesa no es la comodidad: es que el modelo "desde fuera" permite
esperar a que una animación **termine** y leer el estilo calculado del elemento, que es justo lo que
T-040 necesita comprobar.

**El coste asumido:** se abandona el ecosistema de Cypress y su modo interactivo, que es mejor. Y se
cambia un criterio de aceptación escrito hace 22 sesiones — por eso queda como ADR y no como un
cambio silencioso.

---

## 2. Qué se construye

| Pieza | Dónde |
|---|---|
| Paquete de la suite | `e2e/` (package.json propio, **fuera de los workspaces**) |
| Configuración | `e2e/playwright.config.ts` |
| Utilidades compartidas | `e2e/src/fixtures.ts` — usuario por API, precondiciones |
| Los tres recorridos | `e2e/src/humo.spec.ts`, `sobres.spec.ts`, `mazos.spec.ts` |
| Imagen y servicio | `docker/e2e.Dockerfile`, servicio `e2e` con perfil |
| ADR | `004Arquitectura/00_ADR.md` — ADR-009 |

### `e2e/` NO entra en los workspaces de npm

Es deliberado. Las imágenes de `api` y `web` hacen `npm ci` de la raíz: si `e2e` fuera un workspace,
Playwright viajaría a dos contenedores que no lo necesitan y engordaría ambos. `e2e/` tiene su propio
`package.json` y se instala sólo dentro de su imagen.

**Contrapartida que conviene saber:** `npm audit` en la raíz **no cubrirá** las dependencias de
`e2e/`. El plan añade un `npm audit` propio dentro de su imagen para que el criterio de aceptación
del proyecto siga significando lo mismo.

---

## 3. Dónde corre

Servicio con perfil, igual que `ingest`:

```bash
docker compose --profile e2e run --rm e2e
```

Sobre la imagen oficial `mcr.microsoft.com/playwright`, que ya trae los navegadores y sus
dependencias del sistema. Depende de `api` sano, y la URL base sale de `E2E_BASE_URL`
(`http://web:5173` dentro de compose), así que el mismo test corre contra `localhost:5173` mientras
se itera.

---

## 4. Los datos: la suite NO ingesta

Los recorridos necesitan cartas y un set abrible. La tentación es que la suite ingeste lo que
necesita, y sería un error: ataría cada ejecución a tres APIs de terceros, una de las cuales
**responde 200 sólo el ~30 % de las veces** (P-016). Una suite que falla porque Pokémon está caído no
mide nada y enseña a ignorar los rojos.

En su lugar:

- **Precondición comprobada al arrancar.** Si `GET /api/games/YGO/sets` no devuelve ningún set con
  `poolSize > 0`, la suite se detiene con el comando exacto que hay que ejecutar:
  `docker compose --profile ingest run --rm --build ingest --game YGO --sets 4`.
- **Cada test crea su propio usuario** por API, con correo único por ejecución. Sin estado
  compartido entre tests y sin orden obligatorio.
- **Las precondiciones se montan por API, no por interfaz.** Si un test de mazos necesita un mazo con
  40 cartas, lo crea con `POST /api/decks` y `PUT /cards`. El navegador se reserva para lo que está
  bajo prueba; hacer login por formulario en cada test sólo añade tiempo y motivos de fallo ajenos.

---

## 5. Los tres recorridos

### 5.1 Humo — `humo.spec.ts`

La aplicación carga, navega entre Catálogo, Sobres, Colección y Mis mazos, y **la consola no escupe
ningún error**. Este último detalle no es adorno: es lo que habría cazado P-025 —la imagen web rota
durante dos sesiones— en el momento de romperse.

También comprueba que el HTML renderizado no contiene ninguna URL externa (P-001).

### 5.2 T-040 — el volteo de las cartas · `sobres.spec.ts`

Es el que lleva bloqueado desde **S017**, cuando se midió que `requestAnimationFrame` no avanzaba ni
un fotograma en 500 ms: la lógica quedó verificada y la animación no.

**Cómo funciona el componente, que es lo que decide el test.** `PackReveal` llama a
`useReducedMotion()` de Framer Motion. Con movimiento reducido **revela todas las cartas de golpe** y
no hay volteo ni clics; el volteo es `motion.button` con `animate={{ rotateY: revelada ? 0 : 180 }}`.

De ahí salen dos exigencias:

1. **El contexto se crea con `reducedMotion: 'no-preference'`, explícito.** No por confiar en el
   valor por defecto de Playwright: si el test corriera con movimiento reducido, encontraría todas
   las cartas ya reveladas y **pasaría sin ejercitar el volteo**. Es la trampa de P-022 con otro
   disfraz.
2. **Se comprueba que la animación TERMINA, no que se ha pedido.** Tras el clic se espera a que
   `aria-pressed` sea `true` **y** a que el `transform` calculado del `.volteador` converja a la
   matriz identidad. Si `requestAnimationFrame` estuviera parado —el fallo de S017— `aria-pressed`
   cambiaría igual y el `transform` nunca convergería: **el test falla, que es lo que se quiere.**

**Y una comprobación de que el test no es vacuo:** el mismo recorrido se ejecuta también con
`reducedMotion: 'reduce'` y se afirma lo contrario — que las cartas aparecen ya reveladas y sin
ningún clic. Si los dos modos se comportaran igual, el test no estaría tocando el camino de la
animación, y este segundo caso lo delata.

### 5.3 T-053 — la interfaz de mazos · `mazos.spec.ts`

Construir un mazo desde el navegador y comprobar que **se pinta**: las dos columnas del editor, la
barra de validación con sus contadores por zona, y las zonas con sus cartas.

Y **capturas de pantalla como artefacto**, guardadas en `e2e/artefactos/`. Es lo que convierte
"nadie lo ha visto" en algo que una persona puede mirar. En dos sesiones seguidas la interfaz se
verificó por DOM y por red porque el panel del navegador no componía imágenes; esto lo cierra.

---

## 6. Errores y diagnóstico

| Situación | Qué pasa |
|---|---|
| Falta la precondición de datos | La suite se detiene con el comando de ingesta exacto |
| La API no responde | El servicio depende de `api` sano; si aun así falla, el error dice la URL |
| Un test falla | Playwright guarda captura, traza y vídeo en `e2e/artefactos/` |
| Playwright no arranca en esta máquina | Se descubre en la **tarea 1** del plan, no al final |

---

## 7. Verificación

**De la propia suite**, que es lo que hace que sirva para algo:

- Los tres recorridos en verde contra el entorno de Docker.
- **El test de T-040 falla si se fuerza `reducedMotion: 'reduce'`** en el caso que espera volteo.
  Comprobado a propósito, porque un test de animación que pasa con la animación desactivada no está
  midiendo nada.
- Los artefactos de T-053 existen y se pueden abrir.

**Criterios de aceptación:** `tsc --build` limpio, la suite de Vitest en verde —**332 tests, que esto
no debe tocar**—, `npm audit` limpio en la raíz **y** dentro de `e2e/`.

---

## 8. Tareas

| ID | Tarea | Agente |
|---|---|---|
| T-055 | **Andamiaje y un test trivial en verde.** Primero, para descubrir pronto si el entorno da | QA / Arquitectura |
| T-056 | ADR-009 escrito en `00_ADR.md` | Documentador |
| T-057 | `fixtures.ts`: usuario por API, precondición de datos, URL base | QA |
| T-058 | Recorrido de humo, con consola limpia y sin URLs externas | QA |
| T-059 | **T-040**: el volteo, con la comprobación de no-vacuidad | QA |
| T-060 | **T-053**: la interfaz de mazos, con capturas como artefacto | QA |

Al cerrar, **T-040 y T-053 quedan cerradas**.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Playwright puede no arrancar en esta máquina.** El panel del navegador no compone imágenes aquí, y no está comprobado que un headless sí | Es la tarea 1: un test trivial en verde antes de escribir nada más. Si no da, se sabe en diez minutos |
| La imagen de Playwright es grande y la primera descarga es lenta | Se paga una vez; el perfil de compose la reutiliza |
| Los tests E2E son la clase de test que más se vuelve intermitente | Sin estado compartido, usuario propio por test, y precondiciones por API en vez de por interfaz |
| `npm audit` de la raíz deja de cubrir `e2e/` | Auditoría propia dentro de su imagen, como parte del criterio de aceptación |
