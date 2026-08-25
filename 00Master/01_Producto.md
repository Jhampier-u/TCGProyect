# 01 — Definición de Producto

## Elevator pitch

Aplicación web que permite **abrir sobres virtuales** de Magic: The Gathering, Yu-Gi-Oh! y
Pokémon TCG con distribuciones de rareza fieles a las reales, acumular las cartas obtenidas en
una **colección persistente**, y **construir mazos** validados contra las reglas de cada juego —
todo bajo una interfaz y un modelo de datos unificados.

## Alcance v1.0 (MVP)

### DENTRO del alcance

| # | Épica | Descripción |
|---|---|---|
| E1 | Catálogo unificado | Ingesta y normalización de cartas de los 3 juegos en un modelo común |
| E2 | Simulador de sobres | Apertura animada con distribución de rareza configurable por set |
| E3 | Colección | Persistencia de cartas obtenidas por usuario, con cantidades y filtros |
| E4 | Constructor de mazos | CRUD de mazos + validación de reglas por juego |
| E5 | Búsqueda | Buscador unificado multi-juego con filtros específicos por juego |
| E6 | Cuentas | Registro/login, sesión, datos privados por usuario |

### FUERA del alcance v1.0 (explícito)

- Juego real / motor de reglas / partidas PvP.
- Comercio, intercambio entre usuarios, economía o pagos reales.
- Precios de mercado en tiempo real (Scryfall y PTCG los exponen; se ingestan como
  *snapshot* informativo, no como feed en vivo).
- App móvil nativa.
- Formatos de torneo con banlists históricas (sólo banlist vigente en v1.0).

## Reglas de negocio clave

- **RN-01** — Una apertura de sobre es **inmutable y auditable**: se persiste la semilla (seed)
  y el resultado. Reabrir la misma apertura debe devolver siempre las mismas cartas.
- **RN-02** — La colección es **aditiva**: abrir sobres suma cantidades, nunca resta.
- **RN-03** — Un mazo referencia cartas del **catálogo**, no de la colección. La app marca qué
  cartas del mazo el usuario **no posee** (modo "wishlist"), pero no lo impide.
- **RN-04** — La validación de mazo es **por juego** y debe ser un *strategy* enchufable:
  - **MTG:** mínimo 60 cartas main, máx. 4 copias por nombre (salvo tierras básicas), sideboard ≤ 15.
  - **YGO:** Main 40–60, Extra ≤ 15, Side ≤ 15, máx. 3 copias por nombre (respetando Forbidden/Limited/Semi-Limited).
  - **PTCG:** exactamente 60 cartas, máx. 4 copias por nombre (salvo cartas de Energía Básica).
- **RN-05** — Ninguna funcionalidad puede depender de una llamada síncrona a una API externa
  durante la petición del usuario. El catálogo se sirve **siempre** desde la BD local.

## Usuarios objetivo

1. **El jugador nostálgico** — quiere la experiencia de abrir sobres sin gastar dinero.
2. **El constructor de mazos** — quiere un deckbuilder que no le obligue a usar 3 webs distintas.
3. **El coleccionista** — quiere ver su colección virtual crecer y medir su completitud por set.
