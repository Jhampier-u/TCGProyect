# 05 — Continuar aquí

**Punto de guardado:** 2026-08-25, tras la sesión **S017**
**Commit:** rama `main` · árbol limpio · 202 tests en verde

Este documento existe para retomar el proyecto en otra máquina o en otra sesión sin releer las 17
bitácoras. Si sólo vas a leer un fichero, que sea éste.

---

## 1. Qué es y en qué punto está

Simulador de apertura de sobres + constructor de mazos para MTG, Yu-Gi-Oh! y Pokémon TCG.

**Funciona hoy, de punta a punta:** un usuario se registra, navega el catálogo de los tres juegos,
abre sobres con las distribuciones reales y con revelado animado carta a carta, y ve su colección
crecer con completitud por set.

| Hito | Estado |
|---|---|
| H0 Fundamentos | 🟡 sólo falta Docker (**T-004**) |
| H1 Esquema · H2 Ingesta · H3 API · H4 Sobres · H5 Frontend · H6 Cuentas | ✅ |
| **H7 Constructor de mazos** | ⚪ **la última épica de producto** |
| H8 Endurecimiento (Cypress, seguridad) | ⚪ |

---

## 2. Lo primero al llegar a una máquina nueva

```bash
npm install && npm run build
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS proyecto_tcg CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
cp .env.example .env      # y rellenar; ver README
npm run ingest -- --game YGO --sets 2
npm run dev:api           # y en otra terminal: npm run dev:web
```

**No hay que hacer nada con las migraciones**: se aplican solas al arrancar la API o el CLI.

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

## 4. Tres invariantes que se rompen en silencio

Esto es lo que de verdad hay que interiorizar antes de tocar código.

### 4.1 El frontend nunca recibe una URL externa (P-001, P-022)
YGOPRODeck castiga el hotlinking con **lista negra de IP permanente**. Las imágenes se descargan una
vez y se re-hospedan. `isSafeLocalPath()` lo comprueba y los esquemas de Fastify eliminan lo no
declarado.

**Pero ojo:** en S016 se filtraron 1032 URLs por exponer `sets.icon_url`. El esquema sólo protege de
lo que **no** declaras; si declaras el campo equivocado, sale. Y el test que debía detectarlo pasaba
en vacío porque la fixture devolvía `null`.

### 4.2 Las claves naturales que "parecen" únicas
**Cinco problemas del proyecto** han sido de esta familia (P-009, P-010, P-013, P-015, P-017). El
patrón siempre es el mismo: una clave que parece identificar una fila, un `ON DUPLICATE KEY UPDATE`,
y datos que desaparecen sin un solo error en los logs.

- `Nidoran♂` y `Nidoran♀` colapsaban en la misma carta
- `set_code` de YGO se repite dentro de un set **y** entre sets (`JUMP` en 70 sets)
- En Pokémon hay 258 cartas y **175 nombres**: el nombre no identifica una carta
- Los nombres de set de YGO llegan a 85 caracteres

**Antes de elegir una clave natural, cuéntala.**

### 4.3 Los bugs que sólo aparecen a escala
Tres veces ha pasado (P-017, P-020, P-022): probar con una muestra elegida a mano **no ejercita el
mismo camino** que procesar el catálogo entero o arrancar el servidor de verdad. Los dobles de prueba
son útiles para la lógica, pero **la fidelidad de sus datos determina lo que el test puede detectar**.

---

## 5. Lo que está pendiente, por orden de interés

### El siguiente paso natural
- **T-004 — Docker Compose** (🟠, corto). Cierra H0. Hoy levantar el entorno es un procedimiento
  manual de varios pasos. Recomendado antes de H7, que se desarrollará más cómodo.
- **H7 — Constructor de mazos** (la última épica de producto). CRUD + validadores por juego
  (RN-04 en `01_Producto.md`) + import/export. Es la primera vez que las reglas de cada juego
  divergen de verdad en el código.

### Deuda con impacto medido
| Tarea | Qué pasa si no se hace |
|---|---|
| **T-035** | Los iconos de set no se pueden mostrar: la API no los expone por P-022 |
| **T-017 → hecho** | — |
| **T-019** | Una URL de imagen rota se reintenta en cada ejecución, para siempre |
| **T-034** | Los sets de YGO anteriores a 2020 topan la completitud en ~70,7 % (P-021) |
| **T-040** | El volteo de las cartas **nunca se ha visto funcionar**: en S017 `requestAnimationFrame` estaba parado |
| **T-016** | Nada verifica que `GAME_IDS` de TypeScript y el seed SQL digan lo mismo |
| **T-022** | Crear la base de datos sigue siendo manual |
| **T-023** | La ingesta acotada procesa primero sets futuros y promocionales |

### Bloqueada por ti
- **T-005 — API key de Pokémon TCG** (`dev.pokemontcg.io`). Sin ella la API responde igual pero con
  cuota diaria muy inferior: suficiente para desarrollar, insuficiente para la ingesta completa.

---

## 6. Problemas abiertos que conviene tener presentes

| ID | Severidad | Resumen |
|---|---|---|
| **P-003** | 🟠 | Residuo: 3 limitaciones de las plantillas de sobre (ver P-008) |
| **P-008** | 🟡 | "The List" de MTG no se modela; el slot de tierra no filtra por tipo |
| **P-016** | 🟠 | La API de Pokémon responde 200 sólo ~30 % de las veces. La ingesta **debe** poder reanudarse |
| **P-021** | 🟡 | Sets de YGO pre-2020: completitud topada al 70,7 % |

Los 21 problemas —16 cerrados, con su medición— están en `003Problemas/Registro_Problemas.md`.

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

---

## 8. Notas de entorno (Windows)

- MySQL 8.0.42 en `C:\Program Files\MySQL\MySQL Server 8.0`. Para verificar sin tocar la instancia
  del usuario, las sesiones han levantado instancias temporales con `mysqld --initialize-insecure`
  en un datadir aparte y puerto 3399.
- Los inputs de React son **controlados**: rellenarlos por automatización exige el *setter* nativo de
  `HTMLInputElement` más un evento `input`. Escribir en `.value` no lo ve React. Relevante para los
  Cypress de H8.
