# S005 — T-001 (Git) y T-009 (`RateLimitedClient`)
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Cierra T-001 primero y luego lanza T-009"*.

## Agentes invocados
1. **Agente Arquitectura** — inicialización del repositorio y política de finales de línea.
2. **Agente Backend** — `RateLimitedClient` completo.
3. **Agente QA** — suite con reloj virtual + prueba de humo contra APIs reales.
4. **Agente Documentador** — sincronización del Vault.

---

## T-001 — Repositorio

`git init -b main`, commit inicial **`bc7eb7c`** con **49 ficheros**. Identidad tomada de la
configuración global existente (Juan Pesantez), sin sobreescribirla.

Antes de commitear se verificó explícitamente que no se colaban `node_modules/`, `dist/`, `.env`
ni `storage/`. Cero fugas.

Se añadió **`.gitattributes`** con `* text=auto eol=lf`, que no estaba previsto en T-001. Motivo:
git avisaba de conversión LF↔CRLF en 40 ficheros. Sin normalizar, en Windows cualquier reescritura
de fichero produce un diff de "todas las líneas cambiadas" y las revisiones de código se vuelven
ilegibles.

---

## T-009 — `RateLimitedClient`

Es la **única puerta de salida** hacia las tres APIs. Ningún adaptador debe llamar a `fetch` por su
cuenta: se perdería el control del ritmo, que es exactamente lo que provoca los bloqueos de IP.

| Fichero | Contenido |
|---|---|
| `types.ts` | `HttpResponse`, `FetchLike`, `Clock`, `HostPolicy` |
| `policies.ts` | Políticas por host + estados reintentables |
| `errors.ts` | `HttpError`, `CircuitOpenError`, `QuotaExhaustedError` |
| `quota.ts` | `QuotaStore` + implementación en memoria |
| `rate-limited-client.ts` | El cliente |

### Decisiones que merecen constar

**1. Un 404 no es una avería.** Sólo se reintenta ante 408/425/429/5xx y errores de red. El resto
de 4xx se propaga de inmediato y **no acerca el cortocircuito**: lo que está mal es la petición, no
el host. Sin esta distinción, unos cuantos 404 legítimos durante una ingesta abrirían el circuito y
detendrían 15 minutos un origen que funciona perfectamente.

**2. Los reintentos consumen cuota.** La cuota se descuenta por intento HTTP, no por petición
lógica, porque un reintento gasta una petición real en el servidor de destino. Contarla una sola
vez llevaría a agotar la cuota real creyendo que sobra margen.

**3. El User-Agent no es sobreescribible** y el constructor falla si viene vacío. Scryfall bloquea
a quien no envía uno propio y descriptivo; es mejor fallar al arrancar que ser bloqueado en
producción.

**4. Todo es inyectable** — `fetch`, `Clock` y la fuente de aleatoriedad del jitter. Sin abstraer el
reloj, probar un backoff de 60 segundos costaría 60 segundos.

---

## Verificación

### Suite automatizada — 38/38 en 820 ms

Cubre: espaciado por host · aislamiento entre hosts · tope de concurrencia · backoff exponencial ·
techo `maxBackoffMs` · `Retry-After` en segundos y HTTP-date · reintento ante error de red ·
no-reintento ante 404 · apertura del cortocircuito · reinicio del contador tras un éxito · cierre
tras el enfriamiento · agotamiento de cuota · consumo de cuota por reintentos · renovación diaria.

### Un test que estaba mal (y el cliente bien)

El test de `concurrency > 1` falló midiendo un hueco de 0 ms. **El fallo estaba en el test.** El
reloj virtual tiene un único `t` global mutable; con varias peticiones en vuelo, los `sleep` de unas
y otras se solapan y el instante registrado deja de reflejar la reserva real de hueco.

Se reescribió para afirmar lo que sí es invariante y observable — N peticiones no pueden despacharse
todas antes de `(N-1) × minIntervalMs` — y se añadió un test aparte que mide directamente el máximo
de peticiones simultáneas. La garantía de concurrencia quedó así cubierta de verdad, no por
casualidad.

### Prueba de humo contra las APIs reales

| Medición | Resultado |
|---|---|
| Hueco entre peticiones a Scryfall | **136 ms** y **137 ms** (mínimo exigido: 120 ms) |
| Petición a YGOPRODeck tras Scryfall | No pagó la espera del otro host |
| 404 real de Scryfall | `HttpError` en **132 ms**, sin reintentos |
| Eventos de reintento o cortocircuito | Ninguno |

---

## Problemas

- **P-002 CERRADO** (rate limits heterogéneos). Era el riesgo R-02 en su mitad de "ritmo".
- **P-012 abierto (🟠)**: `InMemoryQuotaStore` pierde la cuenta al reiniciar el worker, mientras que
  la cuota real en el servidor de Pokémon sigue consumida. Con una ingesta de horas y un worker que
  puede reiniciarse, dos o tres reinicios bastarían para agotar la cuota diaria creyendo que sobran
  miles de peticiones. **No arrancar la ingesta completa de Pokémon hasta cerrar T-017.**

---

## Estado al cerrar
- H0: sólo falta Docker (T-004) · H1 ✅ · **H2: infraestructura lista, faltan los 3 adaptadores.**
- Tareas: 16 realizadas · 9 pendientes · 1 bloqueada.
- Tests: **38/38** · `tsc --build` limpio · `npm audit` limpio.

## Siguiente acción esperada
Los tres adaptadores (T-011, T-012, T-013) están desbloqueados y son **independientes entre sí**:
cada uno implementa la misma interfaz contra una API distinta.
