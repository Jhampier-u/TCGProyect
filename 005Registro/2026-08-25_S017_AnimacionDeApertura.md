
# S017 — Animación de apertura (T-039) · Cierre de H5
**Fecha:** 2026-08-25 · **Orquestador:** Claude.md

## Requerimiento del usuario
*"Sí, lanza T-039"*.

## Agentes invocados
1. **Agente Frontend** — componente de revelado y estilos.
2. **Agente QA** — tests del orden + verificación en navegador.
3. **Agente Documentador** — Vault.

---

## La decisión que hace buena la animación no es la animación

Es el **orden**. La gracia de abrir un sobre real está en que primero sale lo previsible y la carta
buena queda para el final. Por eso el revelado **no respeta el orden de los slots**, sino que ordena
por escasez ascendente.

En Yu-Gi-Oh! da igual —el *hit* ya es el último slot— pero en Magic la rara está en el slot 10 y los
comodines en el 12 y 13. **Revelar por posición destriparía el final**: se vería la mítica antes que
la rara.

Esa lógica se extrajo a `ordenarPorEscasez()`, fuera del componente, con **6 tests** que no dependen
de un navegador. Uno de ellos cubre un caso que no es hipotético: una rareza **desconocida** —el
contrato de P-007 permite insertarlas al vuelo— no debe colarse al final como si fuera lo mejor del
sobre.

---

## Detalles de implementación

**Volteo 3D real**, no un cruce de opacidades: `perspective` en el contenedor, `rotateY` con muelle,
y `backface-visibility: hidden` en ambas caras. Sin la perspectiva se ve un aplastamiento horizontal;
sin el `backface-visibility` se ve la cara trasera espejada a través de la delantera.

**Reversos dibujados en CSS**, deliberadamente genéricos. No se reproducen los reversos reales de
cada juego: son obra protegida, y además obligaría a descargar y re-hospedar más imágenes de terceros
justo cuando llevamos diecisiete sesiones evitando eso (P-001).

**Movimiento reducido respetado.** Con `prefers-reduced-motion`, las cartas aparecen ya reveladas y el
brillo del foil deja de latir. La animación es adorno: **el contenido no puede depender de ella**.

**La carta destacada crece un 4 %** al salir. Es el único momento en que la interfaz dice "esta
importa".

Coste: Framer Motion sube el bundle de **73,5 a 113,8 kB gzip**. Es la partida más cara del frontend
y conviene tenerlo escrito.

---

## Verificación, y lo que NO se pudo verificar

### Lo comprobado en el navegador real
| Comprobación | Resultado |
|---|---|
| Estado inicial | 9 cartas boca abajo, reverso `reverso-ygo`, `aria-pressed="false"` |
| Etiquetas accesibles | "Carta N sin revelar" → nombre real tras revelar |
| Clic individual | Revela sólo esa carta |
| "Revelar las 9 restantes" | Revela todas escalonadamente |
| **Orden final** | **8 comunes y la `super rare` foil la última** ✅ |
| Brillo del foil | Presente sólo en la carta foil |
| Perspectiva y backface | `900px` / `hidden` |

### Lo que no se pudo comprobar, y por qué
**El volteo en sí.** El panel del navegador no compone fotogramas en este entorno, y se midió:

```
framesEn500ms: 0 · visibilityState: "hidden"
```

Con `requestAnimationFrame` parado, **ninguna animación puede avanzar** — ni la de Framer Motion ni
ninguna otra. El `transform` se quedaba en el estado inicial mientras el `aria-pressed` y el nombre
sí cambiaban, que es exactamente el síntoma esperable.

No es un fallo del producto, pero **tampoco puedo afirmar que el volteo se vea bien**: no lo he visto.
Queda registrado como **T-040**, a cerrar con el panel visible o en los Cypress de H8.

Se prefiere decirlo a dar por buena una animación no observada.

---

## Estado al cerrar
- **H5 ✅** · H0–H6 completos salvo Docker (T-004). Quedan H7 (mazos) y H8 (endurecimiento).
- Tareas: **52 realizadas · 8 pendientes · 1 bloqueada**.
- Problemas: 5 abiertos · 16 cerrados.
- Tests: **202/202** · `tsc --build` limpio · `npm audit` limpio.

Una comprobación colateral que salió gratis: al re-sembrar el entorno, el job de imágenes reportó
**0 descargas y 125 omitidas en 0,5 s** (frente a 38 s la primera vez). La salvaguarda de P-001
funciona **entre sesiones distintas**, que es justo el escenario para el que se diseñó.

## Siguiente acción esperada
Dos frentes con sentido: **H7 (constructor de mazos)**, la última épica de producto sin empezar, o
**T-004 (Docker)**, que cerraría H0 y permitiría levantar todo el entorno con una orden en vez del
procedimiento manual que hoy hace falta.
