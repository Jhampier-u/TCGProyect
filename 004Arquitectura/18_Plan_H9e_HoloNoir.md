# Plan de implementación — H9e: Holo Noir y la apertura épica

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que abrir un sobre sea un ritual — rasgar, mazo, una a una, anticipación de la rara — sobre una
interfaz Holo Noir, con sobres propios por época y set y cinco niveles de brillo por rareza.

**Architecture:** la API de apertura no cambia (D-7). El servidor gana `sets.palette` (0028), un
comando que la calcula sin red y dos campos en `SetSummary` (`palette`, `artKey`), con el `artKey`
resuelto por **el mismo fragmento SQL** que usa el motor de sobres. La web gana dos módulos puros
(`rareza.ts`, `ritual.ts`), cuatro componentes en `components/apertura/` y una hoja `brillos.css`;
`PackReveal` desaparece y su orden por escasez se muda a `ritual.ts`.

**Tech Stack:** TypeScript, React 18, Framer Motion 13, `<canvas>` 2D, Fastify 5, mysql2, sharp,
Vitest, Playwright.

> **Spec:** `17_Spec_H9e_HoloNoir.md` · **Sesión:** S037 · **Tareas:** T-098 a T-107
> Diez tareas, en este orden. **Se puede parar limpio después de cualquiera.**

---

## Lo que se comprobó al escribir el plan, y corrige el spec

**1. El nivel no sale del tier a secas: sale del tier POR JUEGO.** El spec decía «tier 1-2 → nivel 1…»
como si los tres juegos compartieran escala. Medido en la base:

| Juego | Tiers | Notas |
|---|---|---|
| Pokémon | 1-9 y 50 | 50 = `promo` |
| Magic | 1-6 | `mythic` es 4, `special` 5, `bonus` 6 |
| Yu-Gi-Oh! | 1-15 y 50 | 50 agrupa etiquetas que no son rarezas (P-007) |

Con una tabla única, una `mythic` de Magic sería nivel 2 y una `starlight_rare` (tier 13) no tendría
nivel. La tabla va por juego (T-099).

**2. No hay `reverse` en los datos.** `pack_opening_cards.finish` sólo vale `foil` o `nonfoil`. El
acabado es `normal | foil`; `reverse` no se modela hasta que exista (YAGNI).

**3. Las pruebas de T-040 no pueden quedar intactas al cien por cien.** Con el sobre sellado, las
cartas no existen hasta que se rasga, y `las cartas llegan boca abajo` esperaría un volteador que
nunca aparece. **Las aserciones no cambian; el ayudante `abrirUnSobre` gana un paso: rasgar.** Con
movimiento reducido no hay sobre sellado y el paso no aplica.

**4. «Una carta de nivel 5 que pasa por la anticipación» no se puede probar E2E de forma
determinista**: las cartas las decide el servidor (D-7) y un sobre no trae SIR a demanda. La
anticipación se prueba en la máquina de estados (T-104) y se **mira** en el navegador abriendo cajas
de *151* (T-107). Probar E2E algo que sólo pasa a veces sería una prueba que falla a veces.

**5. El DOM del ritual tiene un orden obligatorio**, y lo fija la prueba de T-040: la bandeja de
reveladas va **antes** que el mazo. Así, el primer `button[aria-pressed]` es el de arriba del mazo
mientras no se ha revelado nada, y la carta recién revelada justo después. Y las cartas de la bandeja
**no se escalan con `transform`**: el test lee `m11` de la matriz para saber si el giro terminó, y una
escala lo falsearía.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `db/migrations/0028_set_palette.{up,down}.sql` | `sets.palette JSON NULL` |
| `apps/api/src/db/plantilla-sql.ts` | El fragmento SQL de elección de plantilla, compartido, y `artKeyDe` |
| `apps/api/src/db/pack-repository.ts` | `findTemplate` pasa a usar el fragmento |
| `apps/api/src/db/catalog-query-repository.ts` | `listSets` devuelve `palette` y `artKey` |
| `apps/api/src/api/schemas.ts` | `LIST_SETS` declara los dos campos |
| `apps/api/src/images/paleta.ts` | `paletaDe(imagen)`: dos colores con sharp, puro |
| `apps/api/src/cli/paleta.ts` | `npm run sobres:paleta` |
| `apps/web/src/styles/tokens.css` | Paleta Holo Noir |
| `apps/web/src/styles/brillos.css` | Los cinco niveles y el foil |
| `apps/web/src/lib/rareza.ts` | `nivelDe(juego, tier)`, `acabadoDe(finish)` |
| `apps/web/src/lib/ritual.ts` | Máquina de estados pura + `ordenarPorEscasez` |
| `apps/web/src/lib/arte-sobres.ts` | Qué ilustraciones existen y su ruta |
| `apps/web/src/components/apertura/CartaConBrillo.tsx` | Carta con su nivel y su acabado |
| `apps/web/src/components/apertura/Sobre.tsx` | El sobre sellado y el gesto de rasgar |
| `apps/web/src/components/apertura/CapaDeEfectos.tsx` | `<canvas>` de partículas y rayos |
| `apps/web/src/components/apertura/Ritual.tsx` | El ritual entero; sustituye a `PackReveal` |
| `004Arquitectura/19_Prompts_Sobres.md` | Los 25 prompts para Nano Banana Pro |
| `e2e/src/ritual.spec.ts` | Pruebas nuevas del ritual |

---

## T-098 · Tokens Holo Noir

**Ficheros**
- Modificar: `apps/web/src/styles/tokens.css`, `apps/web/src/styles.css`, `apps/web/src/main.tsx`,
  `apps/web/package.json`, `tools/contraste-tokens.test.ts`

- [ ] **1. Escribir primero la prueba que falla.** En `tools/contraste-tokens.test.ts`, añadir al final
      de `PAREJAS` los colores de nivel, que pintan texto en la etiqueta de rareza:

```ts
  // Los colores de nivel de rareza (H9e) pintan la etiqueta del nivel en la
  // ficha y en la bandeja: son texto pequeno y piden 4,5.
  ['nivel-2', 'superficie', 4.5],
  ['nivel-3', 'superficie', 4.5],
  ['nivel-4', 'superficie', 4.5],
  ['nivel-5', 'superficie', 4.5],
```

- [ ] **2. Ver que falla.** `npx vitest run tools/contraste-tokens` → FAIL con
      `el token --nivel-2 no existe en este tema`.

- [ ] **3. Cambiar la paleta.** En `tokens.css`, sustituir **sólo los valores** de estos tokens
      (la estructura, los comentarios, los tipos de Pokémon y la capa por juego se quedan):

| Token | `:root` (oscuro) | Los dos bloques claros |
|---|---|---|
| `--fondo` | `#07080c` | `#f2f1f6` |
| `--fondo-alt` | `#0d0f16` | `#fbfbfe` |
| `--superficie` | `#141722` | `#ffffff` |
| `--borde` | `#232736` | `#dcdae6` |
| `--borde-control` | `#6b7290` | `#7f7c92` |
| `--texto` | `#eceef6` | `#15161d` |
| `--texto-tenue` | `#9ba2b8` | `#585d6e` |
| `--acento` | `#ad8cff` | `#6a3fd1` |
| `--acento-tenue` | `#5b47a3` | `#b9a6ee` |
| `--sobre-acento` | `#120a24` | `#ffffff` |
| `--peligro` | `#e5534b` | `#b3241f` |
| `--exito` | `#4fae73` | `#2f6d45` |

      Y añadir, en `:root` **y en los dos bloques claros con los mismos nombres**:

```css
  /* ------------------------------------------------------- Holo Noir (H9e)
   * Luz ambiental: dos focos de color sobre el negro. En claro se apagan casi
   * del todo: el holografico es de la oscuridad. */
  --luz-1: rgba(124, 92, 255, 0.30);
  --luz-2: rgba(56, 189, 248, 0.14);
  --cristal: rgba(255, 255, 255, 0.04);
  --cristal-borde: rgba(255, 255, 255, 0.09);
  --holo: conic-gradient(from 0deg, #ff6ad5, #c774e8, #ad8cff, #8795e8, #94d0ff, #7cffcb, #fffb96, #ff6ad5);
  /* Color de cada nivel de rareza: halos, chispas y la etiqueta del nivel. */
  --nivel-2: #c9d2e3;
  --nivel-3: #7cc8ff;
  --nivel-4: #b69cff;
  --nivel-5: #ffd65a;
  --fuente-titulo: "Space Grotesk", var(--fuente);
```

      Valores claros de esos mismos tokens (idénticos en los dos bloques):

```css
  --luz-1: rgba(106, 63, 209, 0.07);
  --luz-2: rgba(14, 116, 144, 0.05);
  --cristal: rgba(255, 255, 255, 0.70);
  --cristal-borde: rgba(21, 22, 29, 0.08);
  --holo: conic-gradient(from 0deg, #d63fa8, #8f4fd1, #6a3fd1, #3f5fd1, #1f8fd1, #1fa88a, #b89a1f, #d63fa8);
  --nivel-2: #4d566b;
  --nivel-3: #0f6aa6;
  --nivel-4: #6a3fd1;
  --nivel-5: #8a6217;
  --fuente-titulo: "Space Grotesk", var(--fuente);
```

- [ ] **4. La fuente, servida por el proyecto** (un CDN de fuentes es una petición a un tercero, lo
      mismo que P-001 prohíbe para imágenes):

```bash
npm install @fontsource/space-grotesk@5 -w @tcg/web
npm audit
```

      Esperado: `found 0 vulnerabilities`. En `apps/web/src/main.tsx`, antes de `./styles/tokens.css`:

```ts
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
```

- [ ] **5. La luz y el cristal en el armazón.** En `apps/web/src/styles.css`, sustituir la regla
      `body` y la de `.cabecera`:

```css
body {
  margin: 0;
  /* La luz ambiental de Holo Noir: dos focos fijos sobre el fondo. Fijos para
     que al hacer scroll la pagina no "arrastre" la luz. */
  background:
    radial-gradient(60% 40% at 50% -10%, var(--luz-1), transparent 70%) fixed,
    radial-gradient(40% 30% at 100% 0%, var(--luz-2), transparent 70%) fixed,
    var(--fondo);
  color: var(--texto);
  font-family: var(--fuente);
  font-size: 15px;
  line-height: 1.5;
}

h1, h2, .marca { font-family: var(--fuente-titulo); letter-spacing: -0.01em; }

.cabecera {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 24px;
  background: var(--cristal);
  backdrop-filter: blur(14px) saturate(140%);
  border-bottom: 1px solid var(--cristal-borde);
  position: sticky;
  top: 0;
  z-index: 10;
}
```

- [ ] **6. Ver que pasa.** `npm test` → todo verde, incluidos los cuatro pares nuevos.

- [ ] **7. Mirarlo.** Catálogo, ficha, Sobres, Colección y Mazos en los dos temas. La captura, no el
      DOM, es la que dice si se lee (§4.4 de `05_Continuar_Aqui.md`).

- [ ] **8. Commit:** `feat(web): Holo Noir tokens, with contrast measured in both themes (T-098)`

---

## T-099 · La escalera de rarezas, por juego

**Ficheros**
- Crear: `apps/web/src/lib/rareza.ts`, `apps/web/src/lib/rareza.test.ts`

- [ ] **1. Escribir la prueba que falla** (`rareza.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { acabadoDe, nivelDe } from './rareza.js';

/**
 * Los tiers REALES de la base el 2026-10-15 (S037), por juego. Si una migracion
 * anade un tier, esta lista lo dira al no encontrarle nivel.
 */
const TIERS = {
  PTCG: [1, 2, 3, 4, 5, 6, 7, 8, 9, 50],
  MTG: [1, 2, 3, 4, 5, 6],
  YGO: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 50],
} as const;

describe('nivel de espectaculo por rareza (H9e)', () => {
  it('ningun tier real se queda sin nivel', () => {
    for (const [juego, tiers] of Object.entries(TIERS)) {
      for (const t of tiers) {
        expect([1, 2, 3, 4, 5], `${juego} tier ${t}`).toContain(nivelDe(juego as 'PTCG', t));
      }
    }
  });

  it('Pokemon: comun 1, rara 2, ex 3, Illustration Rare 4, SIR e Hyper 5', () => {
    expect([1, 2, 3, 5, 7, 8, 9].map((t) => nivelDe('PTCG', t))).toEqual([1, 1, 2, 3, 4, 5, 5]);
  });

  it('Magic: la mitica es holo y no un destello', () => {
    // Con una tabla unica para los tres juegos, tier 4 seria nivel 2.
    expect(nivelDe('MTG', 3)).toBe(2);
    expect(nivelDe('MTG', 4)).toBe(3);
    expect(nivelDe('MTG', 5)).toBe(4);
  });

  it('Yu-Gi-Oh!: Starlight y Quarter Century son leyenda', () => {
    expect(nivelDe('YGO', 13)).toBe(5);
    expect(nivelDe('YGO', 11)).toBe(5);
    expect(nivelDe('YGO', 8)).toBe(4);
  });

  it('el tier 50 no es lo mejor del sobre: promo y etiquetas son nivel 2', () => {
    expect(nivelDe('PTCG', 50)).toBe(2);
    expect(nivelDe('YGO', 50)).toBe(2);
  });

  it('un tier desconocido es comun, como en el orden de revelado (P-007)', () => {
    expect(nivelDe('PTCG', 0)).toBe(1);
    expect(nivelDe('MTG', 99)).toBe(1);
  });

  it('el acabado va aparte: foil o normal', () => {
    expect(acabadoDe('foil')).toBe('foil');
    expect(acabadoDe('nonfoil')).toBe('normal');
    expect(acabadoDe('lo que sea')).toBe('normal');
  });
});
```

- [ ] **2. Ver que falla.** `npx vitest run apps/web/src/lib/rareza.test.ts` → FAIL, no existe el módulo.

- [ ] **3. Implementar** (`rareza.ts`):

```ts
import type { GameCode } from '@tcg/shared';

/**
 * Los cinco niveles de espectaculo de H9e (spec, seccion 6).
 *
 * POR JUEGO Y NO POR TIER A SECAS: los tiers no significan lo mismo en cada
 * juego. Magic acaba en 6, Yu-Gi-Oh! llega a 15, y el 50 de los dos agrupa
 * promos y etiquetas que no son rarezas (P-007). Con una tabla unica, una
 * mitica de Magic seria un "destello" y una Starlight no tendria nivel.
 */
export type Nivel = 1 | 2 | 3 | 4 | 5;
export type Acabado = 'normal' | 'foil';

const TABLA: Record<GameCode, Readonly<Record<number, Nivel>>> = {
  PTCG: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 50: 2 },
  MTG: { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4 },
  YGO: {
    1: 1, 2: 1, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4,
    9: 5, 10: 5, 11: 5, 12: 5, 13: 5, 14: 5, 15: 5, 50: 2,
  },
};

/** Un tier desconocido es comun: lo mismo que hace el orden de revelado. */
export function nivelDe(juego: GameCode, tier: number): Nivel {
  return TABLA[juego][tier] ?? 1;
}

/** `foil` es una propiedad fisica, no de rareza: no sube el nivel. */
export function acabadoDe(finish: string): Acabado {
  return finish === 'foil' ? 'foil' : 'normal';
}
```

- [ ] **4. Ver que pasa** el mismo comando.
- [ ] **5. Commit:** `feat(web): rarity spectacle levels, per game and not per raw tier (T-099)`

---

## T-100 · `CartaConBrillo` y la hoja de brillos

**Ficheros**
- Crear: `apps/web/src/components/apertura/CartaConBrillo.tsx`, `apps/web/src/styles/brillos.css`
- Modificar: `apps/web/src/main.tsx`, `apps/web/src/components/FichaDeCarta.tsx`

- [ ] **1. El componente** (`CartaConBrillo.tsx`):

```tsx
import { useRef, type PointerEvent } from 'react';
import { imageUrl } from '../../lib/api.js';
import type { Acabado, Nivel } from '../../lib/rareza.js';

/**
 * Inclinacion maxima por nivel, en grados. 16 es el techo del spec (seccion 9):
 * mas que eso marea. Los niveles 1 y 2 no se inclinan: una comun no es una
 * pieza de vitrina.
 */
const INCLINACION: Record<Nivel, number> = { 1: 0, 2: 0, 3: 9, 4: 16, 5: 16 };

interface Props {
  imagePath: string | null;
  nombre: string;
  nivel: Nivel;
  acabado: Acabado;
}

/**
 * Una carta con el brillo de su nivel y la textura de su acabado (H9e-3).
 *
 * Las capas siguen al puntero por variables CSS (`--mx`, `--my`, `--rx`,
 * `--ry`) y no por estado de React: moverse por encima no re-renderiza nada.
 * Nivel y acabado salen tambien como `data-*`, que es por donde los mira la
 * suite E2E.
 *
 * NO ES INTERACTIVA: no es un boton. Va DENTRO del boton que la voltea, y dos
 * controles anidados serian dos paradas de tabulador para una sola cosa.
 */
export function CartaConBrillo({ imagePath, nombre, nivel, acabado }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const src = imageUrl(imagePath);

  const mover = (e: PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const max = INCLINACION[nivel];
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    el.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
  };

  const soltar = () => {
    const el = ref.current;
    if (!el) return;
    for (const v of ['--mx', '--my']) el.style.setProperty(v, '50%');
    for (const v of ['--rx', '--ry']) el.style.setProperty(v, '0deg');
  };

  return (
    <span
      ref={ref}
      className={`brillo brillo-n${nivel} acabado-${acabado}`}
      data-nivel={nivel}
      data-acabado={acabado}
      onPointerMove={mover}
      onPointerLeave={soltar}
    >
      {src ? <img src={src} alt={nombre} loading="lazy" decoding="async" /> : <span className="sin-imagen">{nombre}</span>}
      <span className="brillo-capa brillo-efecto" aria-hidden="true" />
      <span className="brillo-capa brillo-reflejo" aria-hidden="true" />
      {acabado === 'foil' && <span className="brillo-capa brillo-foil" aria-hidden="true" />}
    </span>
  );
}
```

- [ ] **2. La hoja** (`brillos.css`), importada en `main.tsx` justo después de `./styles.css`:

```css
/*
 * Los cinco niveles de brillo de H9e (spec, seccion 6) y la textura foil.
 * Ni un literal de color: todo sale de `tokens.css` (`--nivel-*`, `--holo`).
 */
.brillo {
  --mx: 50%; --my: 50%; --rx: 0deg; --ry: 0deg;
  position: relative; display: block; border-radius: 4.5% / 3.2%;
  transform: perspective(700px) rotateX(var(--rx)) rotateY(var(--ry));
  transition: transform 120ms ease-out;
}
.brillo img { display: block; inline-size: 100%; block-size: auto; border-radius: inherit; }
.brillo-capa { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }

/* 1 · base: nada. */
.brillo-n1 .brillo-efecto, .brillo-n1 .brillo-reflejo { display: none; }

/* 2 · destello: filo metalico y barrido periodico. */
.brillo-n2 { outline: 1px solid var(--nivel-2); outline-offset: -1px; }
.brillo-n2 .brillo-efecto {
  background: linear-gradient(110deg, transparent 35%, rgb(255 255 255 / 0.55) 50%, transparent 65%);
  background-size: 250% 100%; mix-blend-mode: overlay;
  animation: brillo-barrido 3.2s ease-in-out infinite;
}
.brillo-n2 .brillo-reflejo { display: none; }
@keyframes brillo-barrido { 0% { background-position: 120% 0 } 60%, 100% { background-position: -120% 0 } }

/* 3 · holo: arcoiris que sigue al puntero. */
.brillo-n3 { box-shadow: 0 0 26px color-mix(in srgb, var(--nivel-3) 55%, transparent); }
.brillo-n3 .brillo-efecto {
  background: linear-gradient(115deg, transparent 20%, rgb(255 0 128 / 0.35) 35%, rgb(255 214 0 / 0.35) 45%,
    rgb(0 255 170 / 0.35) 55%, rgb(0 140 255 / 0.35) 65%, transparent 80%);
  background-size: 220% 220%; background-position: var(--mx) var(--my);
  mix-blend-mode: color-dodge; opacity: 0.8;
}
.brillo-n3 .brillo-reflejo, .brillo-n4 .brillo-reflejo, .brillo-n5 .brillo-reflejo {
  background: radial-gradient(circle at var(--mx) var(--my), rgb(255 255 255 / 0.45), transparent 45%);
  mix-blend-mode: overlay;
}

/* 4 · galeria: prisma suave e inclinacion fuerte (16 grados). */
.brillo-n4 { box-shadow: 0 0 30px color-mix(in srgb, var(--nivel-4) 50%, transparent); }
.brillo-n4 .brillo-efecto {
  background: conic-gradient(from 0deg at var(--mx) var(--my), rgb(255 120 200 / 0.22),
    rgb(120 200 255 / 0.22), rgb(160 255 200 / 0.22), rgb(255 240 140 / 0.22), rgb(255 120 200 / 0.22));
  mix-blend-mode: soft-light;
}

/* 5 · leyenda: oro y arcoiris. Los rayos y las chispas son del lienzo. */
.brillo-n5 {
  box-shadow: 0 0 40px color-mix(in srgb, var(--nivel-5) 70%, transparent),
    0 0 80px color-mix(in srgb, var(--nivel-4) 40%, transparent);
}
.brillo-n5 .brillo-efecto {
  background: linear-gradient(125deg, transparent 15%, rgb(255 214 90 / 0.45) 35%, rgb(255 120 200 / 0.35) 50%,
    rgb(120 200 255 / 0.35) 62%, transparent 80%);
  background-size: 240% 240%; background-position: var(--mx) var(--my);
  mix-blend-mode: color-dodge;
}

/* El acabado, aparte: una trama brillante que no sube el nivel. */
.brillo-foil {
  background: repeating-linear-gradient(135deg, transparent 0 6px, rgb(180 220 255 / 0.30) 6px 8px);
  mix-blend-mode: overlay;
}

/* Movimiento reducido: los brillos se quedan quietos y la carta no se inclina. */
@media (prefers-reduced-motion: reduce) {
  .brillo { transform: none !important; }
  .brillo-capa { animation: none !important; }
}
```

- [ ] **3. Usarla en la ficha.** En `FichaDeCarta.tsx`, sustituir el `<img>` de `.ficha-imagen` por
      `CartaConBrillo`, con `nivelDe(juego, tier)` (tier desde `consultaRarezas`) y `acabado="normal"`
      — la ficha es de una impresión, no de una copia con acabado.
- [ ] **4. Mirarlo** con las cinco cartas de la maqueta (Abra, Aerodactyl, Charizard ex, Charmander IR,
      Charizard SIR de *151*): la ficha de cada una tiene que parecerse a la escalera aprobada.
- [ ] **5. `npm test`** verde.
- [ ] **6. Commit:** `feat(web): card shine by spectacle level, with the finish apart (T-100)`

---

## T-101 · La paleta y el arte de cada set, en la API

**Ficheros**
- Crear: `db/migrations/0028_set_palette.up.sql`, `db/migrations/0028_set_palette.down.sql`,
  `apps/api/src/db/plantilla-sql.ts`, `apps/api/src/db/arte-de-sobre.test.ts`
- Modificar: `apps/api/src/db/pack-repository.ts`, `apps/api/src/db/catalog-query-repository.ts`,
  `apps/api/src/api/schemas.ts`, `apps/api/src/api/server.test.ts`, `apps/web/src/lib/api.ts`,
  `db/README.md`, `00Master/04_Diccionario_Datos.md`, `Claude.md`

- [ ] **1. La migración** (`db/migrations/0028_set_palette.up.sql`):

```sql
-- =====================================================================
-- ProyectoTCG - Migracion 0028 - La paleta de cada set
-- Agente: Base de Datos - Tarea: T-101 - Sesion: S037
-- =====================================================================
-- Los sobres de H9e son UNA ilustracion por epoca teñida con los colores de
-- cada set. Esos colores se calculan una vez (`npm run sobres:paleta`, sin red,
-- desde las imagenes ya cosechadas) y se guardan aqui.
--
-- JSON y no dos columnas: es un dato de presentacion que se lee entero y nunca
-- se filtra ni se ordena por el. Forma: {"primario":"#rrggbb","secundario":"#rrggbb"}.
--
-- NULLABLE A PROPOSITO: un set sin paleta todavia no es un error. La web usa
-- los colores de dorso del juego hasta que el comando la calcule. Y si una
-- paleta automatica sale fea, se corrige a mano aqui sin tocar codigo.
ALTER TABLE sets ADD COLUMN palette JSON NULL AFTER icon_failed_at;
```

      (`db/migrations/0028_set_palette.down.sql`):

```sql
-- Rollback de 0028. No se pierde nada que no se pueda recalcular: la paleta
-- deriva de las imagenes con `npm run sobres:paleta`.
ALTER TABLE sets DROP COLUMN palette;
```

- [ ] **2. Escribir la prueba que falla** (`arte-de-sobre.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { CatalogQueryRepository } from './catalog-query-repository.js';
import { PackRepositoryMysql } from './pack-repository.js';
import { PLANTILLA_DE_EPOCA_O_LINEA, artKeyDe } from './plantilla-sql.js';
import type { Database } from './connection.js';

function espia(filas: unknown[] = []) {
  const consultas: string[] = [];
  const db = {
    select: async (sql: string) => {
      consultas.push(sql);
      return filas;
    },
  } as unknown as Database;
  return { db, consultas };
}

describe('el arte del sobre sale de la MISMA eleccion que el motor (H9e)', () => {
  it('findTemplate y listSets usan el mismo fragmento SQL', async () => {
    // Si las dos consultas tuvieran cada una su copia, un dia una cambiaria y
    // el sobre de un set enseñaria una epoca y traeria las cartas de otra.
    const motor = espia();
    await new PackRepositoryMysql(motor.db).findTemplate(1);
    expect(motor.consultas[0]).toContain(PLANTILLA_DE_EPOCA_O_LINEA('t', 's'));

    const catalogo = espia();
    await new CatalogQueryRepository(catalogo.db).listSets('PTCG');
    expect(catalogo.consultas[0]).toContain(PLANTILLA_DE_EPOCA_O_LINEA('t2', 's'));
  });

  it('el artKey es el nombre de la plantilla, normalizado', () => {
    expect(artKeyDe('Booster Scarlet & Violet')).toBe('booster-scarlet-violet');
    expect(artKeyDe('Core Booster (hasta Light of Destruction)')).toBe('core-booster-hasta-light-of-destruction');
    expect(artKeyDe('Booster clasico (hasta la era EX)')).toBe('booster-clasico-hasta-la-era-ex');
  });

  it('listSets devuelve paleta y artKey, y null cuando no los hay', async () => {
    const fila = {
      id: 1, external_id: 'sv3pt5', code: 'MEW', name: '151', released_at: '2023-09-22',
      card_count: 207, is_openable: 1, icon_url: null, icon_local_path: null, pool_size: 165,
      palette: '{"primario":"#c0392b","secundario":"#ffd54a"}', plantilla: 'Booster Scarlet & Violet',
    };
    const { db } = espia([fila, { ...fila, id: 2, palette: null, plantilla: null }]);
    const [con, sin] = await new CatalogQueryRepository(db).listSets('PTCG');
    expect(con).toMatchObject({ palette: { primario: '#c0392b', secundario: '#ffd54a' }, artKey: 'booster-scarlet-violet' });
    expect(sin).toMatchObject({ palette: null, artKey: null });
  });
});
```

- [ ] **3. Ver que falla.** `npx vitest run apps/api/src/db/arte-de-sobre.test.ts` → FAIL, no existe `plantilla-sql`.

- [ ] **4. El fragmento compartido** (`plantilla-sql.ts`):

```ts
/**
 * Que plantilla de EPOCA o de LINEA corresponde a un set (H9e).
 *
 * Lo usan dos consultas que no pueden discrepar: `findTemplate`, que decide que
 * TRAE un sobre, y `listSets`, que decide que ARTE lleva. Si cada una tuviera
 * su copia, el sobre de un set ensenaria una epoca y traeria las cartas de otra
 * sin un solo error. Por eso el texto vive aqui una vez, y una prueba comprueba
 * que las dos lo incluyen literalmente.
 *
 * NO incluye las plantillas propias de un set (`t.set_id = s.id`): esas las
 * anade `findTemplate`, porque el arte es de epoca, no de producto.
 */
export const PLANTILLA_DE_EPOCA_O_LINEA = (t: string, s: string): string => `(
     (${t}.set_id IS NULL AND ${t}.product_line IS NOT NULL AND ${t}.product_line = ${s}.product_line)
  OR (${t}.set_id IS NULL AND ${t}.product_line IS NULL
      AND (${t}.valid_from IS NOT NULL OR ${t}.valid_to IS NOT NULL)
      AND ${s}.released_at IS NOT NULL
      AND (${t}.valid_from IS NULL OR ${s}.released_at >= ${t}.valid_from)
      AND (${t}.valid_to   IS NULL OR ${s}.released_at <= ${t}.valid_to))
  OR (${t}.set_id IS NULL AND ${t}.product_line IS NULL AND ${t}.is_default = 1
      AND ${t}.valid_from IS NULL AND ${t}.valid_to IS NULL))`;

/** La precedencia: set, linea, ventana, por defecto. */
export const ORDEN_DE_PLANTILLA = (t: string, s: string): string => `CASE
      WHEN ${t}.set_id = ${s}.id THEN 1
      WHEN ${t}.product_line IS NOT NULL THEN 2
      WHEN ${t}.valid_from IS NOT NULL OR ${t}.valid_to IS NOT NULL THEN 3
      ELSE 4
    END`;

/**
 * El nombre de una plantilla como clave de fichero: "Booster Scarlet & Violet"
 * -> "booster-scarlet-violet". Las marcas diacriticas se quitan con la
 * propiedad Unicode y no con una lista de letras (regla de ASCII puro).
 */
export function artKeyDe(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

- [ ] **5. `findTemplate` lo usa.** En `pack-repository.ts`, sustituir el `WHERE … LIMIT 1` actual por:

```ts
      `SELECT t.id, t.game_id, t.name, t.card_count
       FROM pack_templates t
       JOIN sets s ON s.game_id = t.game_id AND s.id = ? AND s.is_openable = 1
       WHERE (t.set_id = s.id AND t.is_default = 1)
          OR ${PLANTILLA_DE_EPOCA_O_LINEA('t', 's')}
       ORDER BY ${ORDEN_DE_PLANTILLA('t', 's')}
       LIMIT 1`,
```

      con `import { ORDEN_DE_PLANTILLA, PLANTILLA_DE_EPOCA_O_LINEA } from './plantilla-sql.js';`. Es el
      mismo SQL de antes, movido: `npx vitest run apps/api/src/packs` tiene que seguir en verde **sin
      tocar una prueba**.

- [ ] **6. `listSets` lo usa.** En `catalog-query-repository.ts`, en la consulta de `listSets`, añadir a
      la lista del `SELECT`, después de `s.icon_local_path,`:

```ts
              s.palette,
              (SELECT t2.name FROM pack_templates t2
                WHERE t2.game_id = s.game_id AND ${PLANTILLA_DE_EPOCA_O_LINEA('t2', 's')}
                ORDER BY ${ORDEN_DE_PLANTILLA('t2', 's')}
                LIMIT 1) AS plantilla,
```

      Añadir `palette: unknown; plantilla: string | null;` al tipo de la fila, y al mapeo:

```ts
      palette: paletaValida(parseJson(r.palette, null)),
      artKey: r.plantilla ? artKeyDe(r.plantilla) : null,
```

      Y, junto a `parseJson`:

```ts
/** Una paleta con la forma de 0028, o null. Una a medias no se sirve. */
function paletaValida(v: unknown): Paleta | null {
  const p = v as Partial<Paleta> | null;
  const hex = /^#[0-9a-f]{6}$/i;
  return p && typeof p.primario === 'string' && hex.test(p.primario)
    && typeof p.secundario === 'string' && hex.test(p.secundario)
    ? { primario: p.primario, secundario: p.secundario }
    : null;
}
```

      En la interfaz `SetSummary`, añadir:

```ts
  /** Dos colores para teñir el sobre (0028). Null hasta `npm run sobres:paleta`. */
  palette: Paleta | null;
  /** La plantilla de epoca o linea, como clave de fichero de arte (H9e). */
  artKey: string | null;
```

      con `export interface Paleta { primario: string; secundario: string }` en el mismo fichero.

- [ ] **7. Declararlos en el esquema** (ADR-007). En `LIST_SETS` de `schemas.ts`, dentro de las
      propiedades de cada set:

```ts
            palette: {
              type: ['object', 'null'],
              properties: { primario: { type: 'string' }, secundario: { type: 'string' } },
            },
            artKey: { type: ['string', 'null'] },
```

- [ ] **8. Los dobles y el cliente.** Añadir `palette: null, artKey: 'play-booster'` a la fixture de
      `listSets` en `server.test.ts` (el type-check de T-086 lo exige), y los dos campos a
      `SetSummary` en `apps/web/src/lib/api.ts` con el mismo tipo.

- [ ] **9. Ver que pasa.** `npm test` → verde.

- [ ] **10. Contra la base real.** Aplicar la 0028 arrancando la API, y comprobar que el artKey de cada
      set abrible coincide con la plantilla del motor:

```bash
docker exec proyecto-tcg-mysql-1 mysql -N -utcg -pcambiame proyecto_tcg -e "SELECT COUNT(*) FROM sets s WHERE s.is_openable = 1 AND s.palette IS NULL"
curl -s "http://127.0.0.1:3001/api/games/PTCG/sets" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log(d.find(x=>x.externalId==='sv3pt5').artKey)})"
```

      Esperado: un recuento (todas sin paleta todavía) y `booster-scarlet-violet`.

- [ ] **11. Rollback a mano**, como con la 0025, la 0026 y la 0027: ejecutar el `down`, comprobar que la
      columna desaparece, y volver a aplicar el `up`.

- [ ] **12. El Vault.** La 0028 en el mapa de `Claude.md`, en `db/README.md` (la comprobación del Vault
      lo exige) y la columna en la tabla `sets` de `04_Diccionario_Datos.md`.

- [ ] **13. Commit:** `feat(api): set palette and pack art key, from the engine's own template choice (T-101)`

---

## T-102 · `npm run sobres:paleta`

**Ficheros**
- Crear: `apps/api/src/images/paleta.ts`, `apps/api/src/images/paleta.test.ts`, `apps/api/src/cli/paleta.ts`
- Modificar: `package.json`

- [ ] **1. Escribir la prueba que falla** (`paleta.test.ts`). Las imágenes se fabrican con sharp, sin red:

```ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { paletaDe } from './paleta.js';

const HEX = /^#[0-9a-f]{6}$/;
const liso = (color: string) =>
  sharp({ create: { width: 32, height: 32, channels: 3, background: color } }).png().toBuffer();

async function partido(izquierda: string, derecha: string): Promise<Buffer> {
  const mitad = await sharp({ create: { width: 16, height: 32, channels: 3, background: izquierda } }).png().toBuffer();
  return sharp({ create: { width: 32, height: 32, channels: 3, background: derecha } })
    .composite([{ input: mitad, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

const rojizo = (h: string) => parseInt(h.slice(1, 3), 16) > parseInt(h.slice(5, 7), 16);

describe('la paleta de un set (H9e)', () => {
  it('siempre dos colores validos', async () => {
    const p = await paletaDe(await liso('#808080'));
    expect(p.primario).toMatch(HEX);
    expect(p.secundario).toMatch(HEX);
  });

  it('con dos colores fuertes, uno es el primario y el otro el secundario', async () => {
    const p = await paletaDe(await partido('#d02020', '#2040d0'));
    expect(rojizo(p.primario)).not.toBe(rojizo(p.secundario));
  });

  it('el gris pesa menos que el color: el marco de la carta no es su color', async () => {
    // Tres cuartas partes grises y una roja: gana el rojo.
    const gris = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#7a7a7a' } }).png().toBuffer();
    const rojo = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#e01818' } }).png().toBuffer();
    const img = await sharp(gris).composite([{ input: rojo, left: 0, top: 0 }]).png().toBuffer();
    expect(rojizo((await paletaDe(img)).primario)).toBe(true);
  });

  it('con un solo color, el secundario es una version oscura del primario', async () => {
    const p = await paletaDe(await liso('#30a050'));
    expect(p.secundario).not.toBe(p.primario);
  });
});
```

- [ ] **2. Ver que falla.** `npx vitest run apps/api/src/images/paleta.test.ts` → FAIL.

- [ ] **3. Implementar** (`paleta.ts`):

```ts
import sharp from 'sharp';

export interface Paleta {
  primario: string;
  secundario: string;
}

type Rgb = readonly [number, number, number];

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const distancia = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Dos colores de una imagen: el que mas pesa y el primero que se distinga de el.
 *
 * Se reduce a 32x32 y se agrupa en cubos de 3 bits por canal. Cada pixel pesa
 * por su SATURACION y su brillo: el marco gris y el negro de una carta ocupan
 * mucho y no son su color. Determinista y sin red: lee la imagen que ya esta en
 * `storage/`.
 */
export async function paletaDe(imagen: Buffer): Promise<Paleta> {
  const { data, info } = await sharp(imagen)
    .resize(32, 32, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cubos = new Map<number, { r: number; g: number; b: number; peso: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturacion = max === 0 ? 0 : (max - min) / max;
    const peso = 0.15 + saturacion * (max / 255);
    const clave = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const c = cubos.get(clave) ?? { r: 0, g: 0, b: 0, peso: 0 };
    c.r += r * peso;
    c.g += g * peso;
    c.b += b * peso;
    c.peso += peso;
    cubos.set(clave, c);
  }

  const colores: Rgb[] = [...cubos.values()]
    .sort((a, b) => b.peso - a.peso)
    .map((c) => [c.r / c.peso, c.g / c.peso, c.b / c.peso] as const);

  const primero: Rgb = colores[0] ?? [40, 40, 60];
  const segundo: Rgb =
    colores.find((c) => distancia(c, primero) > 90) ?? [primero[0] * 0.4, primero[1] * 0.4, primero[2] * 0.4];
  return { primario: hex(primero), secundario: hex(segundo) };
}
```

- [ ] **4. Ver que pasa** el mismo comando.

- [ ] **5. El comando** (`cli/paleta.ts`):

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GAME_IDS, type GameCode } from '@tcg/shared';
import { loadConfig } from '../config.js';
import { Database } from '../db/index.js';
import { paletaDe } from '../images/paleta.js';

/**
 * `npm run sobres:paleta [-- --game PTCG] [-- --recalcular]` (H9e, T-102).
 *
 * SIN RED: lee las imagenes ya cosechadas en `storage/`. La de la impresion de
 * mayor tier del set, que es la que mejor dice de que color es; si no hay
 * ninguna, el icono. Sin `--recalcular` solo rellena las que faltan, asi que se
 * puede relanzar sin pisar una paleta corregida a mano.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--game');
  const juego = i >= 0 ? (argv[i + 1]?.toUpperCase() as GameCode | undefined) : undefined;
  const recalcular = argv.includes('--recalcular');

  const config = loadConfig();
  const db = new Database({ url: config.databaseUrl });
  let hechas = 0;
  let sinImagen = 0;
  let fallidas = 0;

  try {
    const sets = await db.select<{ id: number; code: string; ruta: string | null }>(
      `SELECT s.id, s.code,
              COALESCE(
                (SELECT p.image_local_path
                   FROM card_prints p JOIN rarities r ON r.id = p.rarity_id
                  WHERE p.set_id = s.id AND p.image_local_path IS NOT NULL
                    AND p.withdrawn_at IS NULL AND r.tier < 50
                  ORDER BY r.tier DESC, p.id
                  LIMIT 1),
                s.icon_local_path) AS ruta
         FROM sets s
        WHERE (? OR s.palette IS NULL)
          AND (? IS NULL OR s.game_id = ?)`,
      [recalcular, juego ? GAME_IDS[juego] : null, juego ? GAME_IDS[juego] : null],
    );

    for (const set of sets) {
      if (!set.ruta) {
        sinImagen += 1;
        continue;
      }
      try {
        const paleta = await paletaDe(await readFile(join(config.storagePath, set.ruta)));
        await db.query('UPDATE sets SET palette = ? WHERE id = ?', [JSON.stringify(paleta), set.id]);
        hechas += 1;
      } catch (e) {
        // Un fichero que falta no para el resto: se cuenta y se dice.
        fallidas += 1;
        console.warn(`[${set.code}] sin paleta: ${(e as Error).message}`);
      }
    }
    console.log(`Paletas: ${hechas} calculadas, ${sinImagen} sets sin imagen, ${fallidas} fallidas.`);
  } finally {
    await db.close();
  }
}

void main();
```

      `Database` escribe con `query` y lee con `select` (`apps/api/src/db/connection.ts`).

- [ ] **6. El script.** En `package.json`, junto a `packs:cobertura`:
      `"sobres:paleta": "node apps/api/dist/cli/paleta.js",`

- [ ] **7. Ejecutarlo de verdad.**

```bash
npm run build && node --env-file=.env apps/api/dist/cli/paleta.js
```

      Esperado: unas 2.250 calculadas. Mirar en el navegador la paleta de *151*, *Evolving Skies* y
      *Bloomburrow*: tienen que «parecerse» al set. Si una sale fea, se corrige en la base.

- [ ] **8. Commit:** `feat(api): compute each set's palette offline from harvested images (T-102)`

---

## T-103 · El sobre, y los prompts para Nano Banana Pro

**Ficheros**
- Crear: `apps/web/src/lib/arte-sobres.ts`, `apps/web/src/components/apertura/Sobre.tsx`,
  `apps/web/public/sobres/.gitkeep`, `004Arquitectura/19_Prompts_Sobres.md`
- Modificar: `apps/web/src/styles/brillos.css`, `apps/web/src/i18n/es.ts`

- [ ] **1. Las rutas del arte** (`arte-sobres.ts`):

```ts
import type { GameCode } from '@tcg/shared';

/**
 * Las ilustraciones de epoca que existen de verdad en `public/sobres/` (H9e-2).
 *
 * Una lista y no un `fetch` a ciegas: pedir una imagen que no esta es un 404
 * por sobre abierto y un hueco en blanco hasta que falla. Cuando llegue una
 * ilustracion nueva, se anade su clave aqui y nada mas.
 */
const DISPONIBLES: Record<GameCode, readonly string[]> = {
  PTCG: [],
  MTG: [],
  YGO: [],
};

/** Ruta del arte de una epoca, o null si todavia no existe (degradado de reserva). */
export function rutaDeArte(juego: GameCode, artKey: string | null): string | null {
  if (!artKey || !DISPONIBLES[juego].includes(artKey)) return null;
  return `/sobres/${juego.toLowerCase()}/${artKey}.webp`;
}
```

- [ ] **2. El componente** (`Sobre.tsx`):

```tsx
import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameCode } from '@tcg/shared';
import { imageUrl, type SetSummary } from '../../lib/api.js';
import { rutaDeArte } from '../../lib/arte-sobres.js';
import { ES } from '../../i18n/es.js';

interface Props {
  juego: GameCode;
  set: SetSummary;
  rasgando: boolean;
  onRasgar: () => void;
}

/**
 * El sobre sellado (H9e-2): el arte de su epoca, tenido con la paleta del set,
 * con su icono y su nombre estampados.
 *
 * ES UN BOTON: Enter o Espacio lo rasgan, igual que un clic. El gesto de
 * arrastrar por el borde es una via MAS, no la unica, y por eso la tira es un
 * elemento aparte, decorativo para el lector de pantalla.
 *
 * Sin arte (la ilustracion todavia no ha llegado) o sin paleta (el comando no
 * se ha lanzado), hay reserva: nada se rompe sin las imagenes.
 */
export function Sobre({ juego, set, rasgando, onRasgar }: Props) {
  const reducido = useReducedMotion();
  const arte = rutaDeArte(juego, set.artKey);
  const icono = imageUrl(set.iconPath);

  const estilo = {
    '--paleta-1': set.palette?.primario ?? 'var(--dorso-1)',
    '--paleta-2': set.palette?.secundario ?? 'var(--dorso-3)',
    ...(arte ? { '--arte': `url("${arte}")` } : {}),
  } as CSSProperties;

  return (
    <div className="sobre-armazon">
      <motion.div
        className="sobre-tira"
        aria-hidden="true"
        drag={rasgando ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={(_e, info) => {
          // Pasada la mitad, se rasga; antes, vuelve a su sitio sola.
          if (info.offset.x > 90) onRasgar();
        }}
        animate={rasgando && !reducido ? { y: -60, rotate: 8, opacity: 0 } : { y: 0, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.45 }}
      />
      <motion.button
        type="button"
        className={arte ? 'sobre-sellado con-arte' : 'sobre-sellado'}
        style={estilo}
        data-art-key={set.artKey ?? ''}
        aria-label={ES.ritual.rasgar(set.name)}
        onClick={onRasgar}
        disabled={rasgando}
        animate={rasgando && !reducido ? { y: 140, opacity: 0.2 } : { y: [0, -6, 0] }}
        transition={rasgando ? { duration: 0.6 } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="sobre-marca">ProyectoTCG</span>
        {icono ? <img className="sobre-icono" src={icono} alt="" /> : <span className="sobre-icono" />}
        <span className="sobre-nombre">{set.name}</span>
      </motion.button>
    </div>
  );
}
```

- [ ] **3. Las cadenas.** En `i18n/es.ts`, un bloque nuevo:

```ts
  /** El ritual de apertura (H9e-4). */
  ritual: {
    rasgar: (set: string) => `Rasgar el sobre de ${set}`,
    pista: 'Arrastra por el borde para rasgarlo, o pulsa.',
    saltar: 'Saltar',
    sinRevelar: (n: number) => `Carta ${n} sin revelar`,
    nuevas: (n: number) => (n === 1 ? '1 nueva' : `${n} nuevas`),
    semilla: 'Semilla de la apertura: la hace reproducible',
  },
```

- [ ] **4. Los estilos del sobre**, al final de `brillos.css`:

```css
/* ------------------------------------------------- el sobre sellado (H9e-2) */
.sobre-armazon { position: relative; display: grid; place-items: center; padding-top: 18px; }
.sobre-sellado {
  position: relative; inline-size: 210px; block-size: 340px; padding: 34px 16px 28px;
  display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  border: 0; border-radius: 6px; color: #fff; font-family: var(--fuente-titulo);
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--paleta-1) 85%, transparent), color-mix(in srgb, var(--paleta-2) 90%, black)),
    var(--fondo);
  box-shadow: 0 30px 60px rgb(0 0 0 / 0.6), 0 0 60px color-mix(in srgb, var(--paleta-1) 35%, transparent);
  clip-path: polygon(0 3%, 4% 0, 8% 3%, 12% 0, 16% 3%, 20% 0, 24% 3%, 28% 0, 32% 3%, 36% 0, 40% 3%, 44% 0, 48% 3%,
    52% 0, 56% 3%, 60% 0, 64% 3%, 68% 0, 72% 3%, 76% 0, 80% 3%, 84% 0, 88% 3%, 92% 0, 96% 3%, 100% 0, 100% 97%,
    96% 100%, 92% 97%, 88% 100%, 84% 97%, 80% 100%, 76% 97%, 72% 100%, 68% 97%, 64% 100%, 60% 97%, 56% 100%,
    52% 97%, 48% 100%, 44% 97%, 40% 100%, 36% 97%, 32% 100%, 28% 97%, 24% 100%, 20% 97%, 16% 100%, 12% 97%,
    8% 100%, 4% 97%, 0 100%);
  cursor: pointer;
}
/* Con arte: la ilustracion de epoca, tenida por la paleta del set. */
.sobre-sellado.con-arte {
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--paleta-1) 45%, transparent), color-mix(in srgb, var(--paleta-2) 55%, transparent)),
    var(--arte) center / cover;
  background-blend-mode: color, normal;
}
.sobre-sellado::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 25%, rgb(255 255 255 / 0.28) 42%, rgb(173 140 255 / 0.22) 48%, transparent 60%);
  mix-blend-mode: screen;
}
.sobre-marca { font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; opacity: 0.8; }
.sobre-icono { inline-size: 84px; block-size: 84px; object-fit: contain; filter: drop-shadow(0 0 14px rgb(255 255 255 / 0.4)); }
.sobre-nombre { font-size: 18px; font-weight: 700; text-align: center; text-wrap: balance; }
.sobre-tira {
  position: absolute; inset-block-start: 18px; inline-size: 210px; block-size: 18px; z-index: 2;
  background: repeating-linear-gradient(90deg, rgb(255 255 255 / 0.85) 0 6px, transparent 6px 10px);
  opacity: 0.55; cursor: grab; border-radius: 2px;
}
```

- [ ] **5. Los 25 prompts** en `004Arquitectura/19_Prompts_Sobres.md`. Un prompt base común y una línea
      de motivo por época; el fichero de salida se llama **exactamente** como el `artKey`:

````markdown
# Prompts de los sobres — Nano Banana Pro

**Prompt base** (se antepone a cada motivo):

> Vertical trading-card booster pack wrapper artwork, 2:3 aspect ratio, 1024x1536, full-bleed
> illustration only. Original design, no text, no letters, no logos, no trademarks, no existing
> characters. Holo Noir style: deep black background with violet and cyan ambient light, iridescent
> holographic foil highlights, subtle glass reflections, cinematic lighting. Leave a calm, darker
> circular area in the upper-middle third (an emblem will be placed there) and a calm band in the
> lower fifth (a title will be placed there). High detail, premium product photography feel.

| Fichero (`apps/web/public/sobres/…`) | Motivo |
|---|---|
| `ptcg/booster-clasico-hasta-la-era-ex.webp` | Retro 1999 energy: bold primary colors under the holo light, a stylised lightning bolt and flame motif, chunky halftone dots |
| `ptcg/booster-diamond-pearl-platinum.webp` | Faceted diamond and pearl shapes, cold platinum sheen, crystalline geometry |
| `ptcg/booster-heartgold-soulsilver.webp` | Warm gold and cool silver wings crossing, autumn leaves drifting |
| `ptcg/booster-black-white-xy.webp` | Strong black and white yin-yang split with a vivid prismatic X glyph made of light |
| `ptcg/booster-sun-moon.webp` | A burning sun and a crescent moon facing each other, tropical night sky |
| `ptcg/booster-sword-shield.webp` | An abstract sword and shield silhouette in brushed steel, misty highlands |
| `ptcg/booster-paldean-fates.webp` | Shimmering shiny-star sparkles over a dusk sky, iridescent everything |
| `ptcg/booster-black-bolt-white-flare.webp` | A black lightning bolt and a white flame spiralling into each other |
| `ptcg/booster-scarlet-violet.webp` | Scarlet and violet gradients, glowing crystal terastal facets, Iberian-style sunset |
| `ptcg/booster-mega-evolution-en-adelante.webp` | A radiant rainbow DNA-like helix bursting from a keystone of light |
| `mtg/booster-clasico-sin-foil.webp` | Antique parchment and old ink textures under the holo light, five coloured gems in a circle |
| `mtg/booster-con-foil-sin-mitica.webp` | Late-90s fantasy: ornate bronze filigree, a single glowing foil gem |
| `mtg/draft-booster.webp` | A planeswalker's spark: swirling arcane sigils, an orange-gold flare |
| `mtg/play-booster.webp` | Modern fantasy: a gateway of light opening onto five colourful realms |
| `ygo/core-booster-hasta-light-of-destruction.webp` | Ancient Egyptian-inspired stone tablet with an all-seeing eye made of light (no real logos) |
| `ygo/core-booster-duelist-genesis-dimension-of-chaos.webp` | Neon synchro rings and a futuristic duel disc shape |
| `ygo/core-booster-breakers-of-shadow-ignition-assault.webp` | Hexagonal link arrows glowing cyan over a dark circuit |
| `ygo/core-booster-eternity-code-en-adelante.webp` | Deep space with a fractured crystalline monolith and violet lightning |
| `ygo/duel-terminal.webp` | Arcade cabinet glow, pixel shards dissolving into holographic light |
| `ygo/gold-series.webp` | Polished gold leaf, black velvet, a single gleaming relic |
| `ygo/battle-pack.webp` | Two clashing energy blades sparking in an arena |
| `ygo/mega-pack.webp` | A vortex of hundreds of tiny glowing cards spiralling outwards |
| `ygo/rarity-collection.webp` | A treasure vault of prismatic gemstones and starlight |
| `ygo/legendary-duelists.webp` | Silhouette of a cloaked duelist against an enormous moon, wind and embers |
| `ygo/movie-pack.webp` | A cinema screen of light, film-strip shapes made of holographic foil |

Al recibirlas: convertir a WebP de calidad 82 y como mucho 150 KB, guardarlas con ese nombre y
añadir su clave a `DISPONIBLES` en `apps/web/src/lib/arte-sobres.ts`.
````

- [ ] **6. Mirarlo** en el navegador con un sobre de *151*, uno de *Bloomburrow* y uno de *Phantom
      Nightmare*: con paleta, sin arte todavía (degradado de reserva).
- [ ] **7. `npm test`** verde.
- [ ] **8. Commit:** `feat(web): sealed pack per era and set, with a fallback until the art arrives (T-103)`

---

## T-104 · La máquina del ritual

**Ficheros**
- Crear: `apps/web/src/lib/ritual.ts`, `apps/web/src/lib/ritual.test.ts`
- Borrar: `apps/web/src/components/PackReveal.test.ts` (su contenido se muda, ver paso 1)

- [ ] **1. Escribir la prueba que falla** (`ritual.test.ts`). Las pruebas del orden se mudan **tal cual**
      desde `PackReveal.test.ts`, cambiando sólo el `import`; debajo, las del ritual:

```ts
import { describe, it, expect } from 'vitest';
import { avanzar, iniciar, ordenarPorEscasez, type Accion, type EstadoRitual } from './ritual.js';
import type { Nivel } from './rareza.js';

// [aqui, sin cambios, los describe('orden de revelado', ...) de PackReveal.test.ts]

const pasar = (e: EstadoRitual, ...acciones: Accion['tipo'][]) =>
  acciones.reduce((s, tipo) => avanzar(s, { tipo } as Accion), e);

const SOBRE: Nivel[] = [1, 1, 2, 3, 5];

describe('el ritual de apertura (H9e-4)', () => {
  it('empieza sellado y nada revelado', () => {
    expect(iniciar(SOBRE, false)).toEqual({ fase: 'sellado', niveles: SOBRE, reveladas: 0 });
  });

  it('con movimiento reducido no hay ritual: todo revelado y al resumen', () => {
    expect(iniciar(SOBRE, true)).toMatchObject({ fase: 'resumen', reveladas: 5 });
  });

  it('rasgar, terminar de rasgar, y el mazo', () => {
    expect(pasar(iniciar(SOBRE, false), 'rasgar').fase).toBe('rasgando');
    expect(pasar(iniciar(SOBRE, false), 'rasgar', 'rasgado').fase).toBe('mazo');
  });

  it('pedir carta sin haber rasgado no hace nada', () => {
    expect(pasar(iniciar(SOBRE, false), 'siguiente')).toEqual(iniciar(SOBRE, false));
  });

  it('las de nivel 1 a 3 se revelan al pedirlas', () => {
    const e = pasar(iniciar(SOBRE, false), 'rasgar', 'rasgado', 'siguiente', 'siguiente', 'siguiente', 'siguiente');
    expect(e).toMatchObject({ fase: 'mazo', reveladas: 4 });
  });

  it('una de nivel 4 o 5 pasa ANTES por la anticipacion', () => {
    const antes = pasar(iniciar(SOBRE, false), 'rasgar', 'rasgado', 'siguiente', 'siguiente', 'siguiente', 'siguiente', 'siguiente');
    expect(antes).toMatchObject({ fase: 'anticipacion', reveladas: 4 });
    expect(pasar(antes, 'anticipado')).toMatchObject({ fase: 'resumen', reveladas: 5 });
  });

  it('durante la anticipacion, pedir otra carta no se la salta', () => {
    const antes = pasar(iniciar([5], false), 'rasgar', 'rasgado', 'siguiente');
    expect(pasar(antes, 'siguiente')).toEqual(antes);
  });

  it('saltar lleva al resumen desde cualquier fase', () => {
    for (const pasos of [[], ['rasgar'], ['rasgar', 'rasgado'], ['rasgar', 'rasgado', 'siguiente']] as Accion['tipo'][][]) {
      expect(pasar(pasar(iniciar(SOBRE, false), ...pasos), 'saltar')).toMatchObject({ fase: 'resumen', reveladas: 5 });
    }
  });

  it('un sobre vacio rasgado acaba en el resumen al pedir carta', () => {
    expect(pasar(iniciar([], false), 'rasgar', 'rasgado', 'siguiente').fase).toBe('resumen');
  });
});
```

- [ ] **2. Ver que falla.** `npx vitest run apps/web/src/lib/ritual.test.ts` → FAIL.

- [ ] **3. Implementar** (`ritual.ts`):

```ts
import type { Nivel } from './rareza.js';

/**
 * El ritual de apertura como maquina de estados pura (H9e-4).
 *
 * Sin React a proposito: los tests de este frontend son de logica, sin DOM, y la
 * secuencia es lo que de verdad hay que probar. El componente solo pinta la fase
 * y despacha acciones; los temporizadores (cuanto dura rasgar, cuanto la
 * anticipacion) son suyos.
 *
 * NO DECIDE NADA (D-7): las cartas, su orden y su rareza llegan del servidor.
 * Esto solo cuenta cuantas se han ensenado.
 */
export type Fase = 'sellado' | 'rasgando' | 'mazo' | 'anticipacion' | 'resumen';

export interface EstadoRitual {
  fase: Fase;
  /** El nivel de cada carta, YA en orden de revelado. */
  niveles: readonly Nivel[];
  /** Cuantas van reveladas, desde el principio del orden. */
  reveladas: number;
}

export type Accion =
  | { tipo: 'rasgar' }
  | { tipo: 'rasgado' }
  | { tipo: 'siguiente' }
  | { tipo: 'anticipado' }
  | { tipo: 'saltar' };

/** Desde que nivel una carta se anuncia antes de voltearse (spec, seccion 7). */
export const NIVEL_CON_ANTICIPACION = 4;

export function iniciar(niveles: readonly Nivel[], reducido: boolean): EstadoRitual {
  // Con movimiento reducido no hay ritual: el contenido no puede depender de la
  // animacion (es lo que comprueba T-040).
  return reducido
    ? { fase: 'resumen', niveles, reveladas: niveles.length }
    : { fase: 'sellado', niveles, reveladas: 0 };
}

export function avanzar(e: EstadoRitual, a: Accion): EstadoRitual {
  if (a.tipo === 'saltar') return { ...e, fase: 'resumen', reveladas: e.niveles.length };
  switch (e.fase) {
    case 'sellado':
      return a.tipo === 'rasgar' ? { ...e, fase: 'rasgando' } : e;
    case 'rasgando':
      return a.tipo === 'rasgado' ? { ...e, fase: 'mazo' } : e;
    case 'mazo': {
      if (a.tipo !== 'siguiente') return e;
      const nivel = e.niveles[e.reveladas];
      if (nivel === undefined) return { ...e, fase: 'resumen' };
      return nivel >= NIVEL_CON_ANTICIPACION ? { ...e, fase: 'anticipacion' } : revelarUna(e);
    }
    case 'anticipacion':
      return a.tipo === 'anticipado' ? revelarUna(e) : e;
    case 'resumen':
      return e;
  }
}

function revelarUna(e: EstadoRitual): EstadoRitual {
  const reveladas = e.reveladas + 1;
  return { ...e, reveladas, fase: reveladas >= e.niveles.length ? 'resumen' : 'mazo' };
}

/**
 * Orden de revelado: de menos a mas escaso. Mudado sin cambios desde
 * `PackReveal` (H5), con su comentario: la gracia de un sobre real esta en
 * dejar la buena para el final, y el orden de los slots la destriparia.
 */
export function ordenarPorEscasez<T extends { rarity: string; slotIndex: number }>(
  cards: readonly T[],
  tiers: Map<string, number>,
): T[] {
  return [...cards].sort((a, b) => {
    // Una rareza desconocida no debe colarse al final como si fuera lo mejor del
    // sobre: sin dato, se trata como la mas comun (P-007).
    const ta = tiers.get(a.rarity) ?? 0;
    const tb = tiers.get(b.rarity) ?? 0;
    if (ta !== tb) return ta - tb;
    return a.slotIndex - b.slotIndex;
  });
}
```

- [ ] **4. Ver que pasa.** El mismo comando, y `git rm apps/web/src/components/PackReveal.test.ts`.
- [ ] **5. Commit:** `feat(web): the opening ritual as a pure state machine (T-104)`

---

## T-105 · La capa de efectos

**Ficheros**
- Crear: `apps/web/src/components/apertura/CapaDeEfectos.tsx`

- [ ] **1. El componente:**

```tsx
import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Nivel } from '../../lib/rareza.js';

/** Particulas por nivel al revelar. Los niveles 1 y 2 no disparan nada. */
const PARTICULAS: Record<Nivel, number> = { 1: 0, 2: 0, 3: 24, 4: 48, 5: 120 };
/** Por debajo de esto (ms por fotograma, ~45 fps) se baja la carga. */
const FOTOGRAMA_LENTO = 22;

interface Particula { x: number; y: number; vx: number; vy: number; vida: number; color: string }

interface Props {
  /** Cambia cada vez que se revela una carta que merece efecto. */
  disparo: number;
  nivel: Nivel;
}

/**
 * El lienzo de partículas y rayos (D-5): lo unico del ritual que no es DOM.
 *
 * NUNCA RECIBE CLICS (`pointer-events: none`) y no tiene contenido para un
 * lector de pantalla: es luz. Con movimiento reducido NO EXISTE -- ni se
 * monta --, y la suite lo comprueba. Se para con la pestana oculta, y si los
 * fotogramas caen por debajo de ~45 fps, baja las particulas: antes se degrada
 * la luz que las cartas.
 */
export function CapaDeEfectos({ disparo, nivel }: Props) {
  const reducido = useReducedMotion();
  const lienzo = useRef<HTMLCanvasElement>(null);
  const particulas = useRef<Particula[]>([]);
  const rayosHasta = useRef(0);
  const carga = useRef(1);

  useEffect(() => {
    if (reducido || disparo === 0) return;
    const c = lienzo.current;
    if (!c) return;
    const estilo = getComputedStyle(c);
    const color = estilo.getPropertyValue(`--nivel-${Math.max(2, nivel)}`).trim() || '#ffd65a';
    const n = Math.round(PARTICULAS[nivel] * carga.current);
    const { width, height } = c;
    for (let i = 0; i < n; i += 1) {
      const angulo = Math.random() * Math.PI * 2;
      const fuerza = 1.5 + Math.random() * 4;
      particulas.current.push({
        x: width / 2, y: height / 2,
        vx: Math.cos(angulo) * fuerza, vy: Math.sin(angulo) * fuerza - 1,
        vida: 1, color,
      });
    }
    if (nivel === 5) rayosHasta.current = performance.now() + 2500;
  }, [disparo, nivel, reducido]);

  useEffect(() => {
    if (reducido) return;
    const c = lienzo.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;

    let marco = 0;
    let anterior = performance.now();
    const ajustar = () => {
      c.width = c.clientWidth * devicePixelRatio;
      c.height = c.clientHeight * devicePixelRatio;
    };
    ajustar();
    window.addEventListener('resize', ajustar);

    const pintar = (ahora: number) => {
      const dt = ahora - anterior;
      anterior = ahora;
      if (dt > FOTOGRAMA_LENTO) carga.current = Math.max(0.25, carga.current * 0.9);
      ctx.clearRect(0, 0, c.width, c.height);

      if (ahora < rayosHasta.current) {
        ctx.save();
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate(ahora / 2400);
        ctx.fillStyle = 'rgba(255, 214, 90, 0.16)';
        for (let i = 0; i < 18; i += 1) {
          ctx.rotate((Math.PI * 2) / 18);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(c.width, -c.width * 0.08);
          ctx.lineTo(c.width, c.width * 0.08);
          ctx.fill();
        }
        ctx.restore();
      }

      particulas.current = particulas.current.filter((p) => p.vida > 0);
      for (const p of particulas.current) {
        p.x += p.vx * devicePixelRatio;
        p.y += p.vy * devicePixelRatio;
        p.vy += 0.06;
        p.vida -= 0.012;
        ctx.globalAlpha = Math.max(0, p.vida);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2 * devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!document.hidden) marco = requestAnimationFrame(pintar);
    };

    const alCambiarVisibilidad = () => {
      if (!document.hidden) {
        anterior = performance.now();
        marco = requestAnimationFrame(pintar);
      }
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    marco = requestAnimationFrame(pintar);
    return () => {
      cancelAnimationFrame(marco);
      window.removeEventListener('resize', ajustar);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [reducido]);

  if (reducido) return null;
  return <canvas ref={lienzo} className="capa-efectos" aria-hidden="true" />;
}
```

- [ ] **2. Su CSS**, al final de `brillos.css`:

```css
.capa-efectos { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; pointer-events: none; z-index: 0; }
```

- [ ] **3. `npm test`** verde (el type-check lo cubre; el comportamiento se mira en T-106).
- [ ] **4. Commit:** `feat(web): particle and ray layer that never takes a click (T-105)`

---

## T-106 · El ritual en la página de Sobres

**Ficheros**
- Crear: `apps/web/src/components/apertura/Ritual.tsx`
- Modificar: `apps/web/src/pages/Sobres.tsx`, `apps/web/src/styles/brillos.css`
- Borrar: `apps/web/src/components/PackReveal.tsx`

- [ ] **1. El componente** (`Ritual.tsx`). El orden del DOM —bandeja antes que mazo— y la bandeja sin
      `scale` son requisitos de la prueba de T-040 (ver «Lo que se comprobó», punto 5):

```tsx
import { useEffect, useId, useMemo, useReducer, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameCode } from '@tcg/shared';
import type { OpenedCard, SetSummary } from '../../lib/api.js';
import { acabadoDe, nivelDe } from '../../lib/rareza.js';
import { avanzar, iniciar, ordenarPorEscasez } from '../../lib/ritual.js';
import { CartaConBrillo } from './CartaConBrillo.js';
import { CapaDeEfectos } from './CapaDeEfectos.js';
import { Sobre } from './Sobre.js';
import { ES } from '../../i18n/es.js';

/** Duraciones del spec (seccion 7). */
const MS_RASGAR = 600;
const MS_ANTICIPACION = 1200;
const MS_RAPIDO = 140;

export interface RitualProps {
  game: GameCode;
  cards: OpenedCard[];
  tiers: Map<string, number>;
  openingId: number;
  seed: string;
  /** El set del sobre: arte, paleta, icono. Null si la lista aun no ha llegado. */
  set: SetSummary | null;
  /** Varios sobres: del segundo en adelante, solo se para en niveles 4 y 5. */
  rapido: boolean;
}

/**
 * El ritual de apertura (H9e-4): sustituye a `PackReveal`.
 *
 * LO QUE NO SE NEGOCIA, heredado de H5 y T-095:
 *  - cada carta es un `button` con `aria-pressed`, dentro de la region
 *    "Sobre #N"; la de arriba del mazo se voltea con clic, Enter o Espacio;
 *  - movimiento reducido = todo revelado y sin lienzo;
 *  - el orden lo decide `ordenarPorEscasez`, no el servidor ni la animacion.
 */
export function Ritual({ game, cards, tiers, openingId, seed, set, rapido }: RitualProps) {
  const reducido = useReducedMotion() ?? false;
  const idTitulo = useId();
  const orden = useMemo(() => ordenarPorEscasez(cards, tiers), [cards, tiers]);
  const niveles = useMemo(() => orden.map((c) => nivelDe(game, tiers.get(c.rarity) ?? 0)), [orden, game, tiers]);
  const [estado, despachar] = useReducer(avanzar, undefined, () => iniciar(niveles, reducido));
  const [disparo, setDisparo] = useState(0);

  // Los tiempos son del componente; la secuencia, de la maquina.
  useEffect(() => {
    if (estado.fase === 'rasgando') {
      const t = setTimeout(() => despachar({ tipo: 'rasgado' }), MS_RASGAR);
      return () => clearTimeout(t);
    }
    if (estado.fase === 'anticipacion') {
      const t = setTimeout(() => despachar({ tipo: 'anticipado' }), MS_ANTICIPACION);
      return () => clearTimeout(t);
    }
    // Sin set (la lista aun no ha llegado) no hay sobre que pintar: se rasga solo
    // en vez de dejar al usuario ante una escena vacia sin nada que pulsar.
    if ((rapido || !set) && estado.fase === 'sellado') despachar({ tipo: 'rasgar' });
    if (rapido && estado.fase === 'mazo' && (niveles[estado.reveladas] ?? 5) < 4) {
      const t = setTimeout(() => despachar({ tipo: 'siguiente' }), MS_RAPIDO);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [estado.fase, estado.reveladas, rapido, niveles, set]);

  // Cada revelado de nivel 3 o mas dispara la capa de efectos.
  const ultimoNivel = estado.reveladas > 0 ? niveles[estado.reveladas - 1]! : 1;
  useEffect(() => {
    if (estado.reveladas > 0 && ultimoNivel >= 3) setDisparo((d) => d + 1);
  }, [estado.reveladas, ultimoNivel]);

  const reveladas = orden.slice(0, estado.reveladas);
  const mazo = orden.slice(estado.reveladas);
  const nuevas = cards.filter((c) => c.isNew).length;
  const sellado = estado.fase === 'sellado' || estado.fase === 'rasgando';

  return (
    <section className="sobre ritual" aria-labelledby={idTitulo} data-fase={estado.fase}>
      <div className="sobre-cabecera">
        <h2 style={{ margin: 0 }} id={idTitulo}>Sobre #{openingId}</h2>
        <span className="semilla" title={ES.ritual.semilla}>{seed}</span>
        <span className="etiqueta nueva">{ES.ritual.nuevas(nuevas)}</span>
        {estado.fase !== 'resumen' && (
          <button type="button" onClick={() => despachar({ tipo: 'saltar' })} style={{ marginLeft: 'auto' }}>
            {ES.ritual.saltar}
          </button>
        )}
      </div>

      <div className="ritual-escena">
        <CapaDeEfectos disparo={disparo} nivel={ultimoNivel} />

        {sellado && set && (
          <>
            <Sobre juego={game} set={set} rasgando={estado.fase === 'rasgando'} onRasgar={() => despachar({ tipo: 'rasgar' })} />
            <p className="ritual-pista">{ES.ritual.pista}</p>
          </>
        )}

        {/* LA BANDEJA VA ANTES QUE EL MAZO EN EL DOM: lo exige la prueba de T-040. */}
        <div className="ritual-bandeja">
          {reveladas.map((carta, i) => (
            <motion.button
              key={carta.slotIndex}
              layoutId={`carta-${openingId}-${carta.slotIndex}`}
              type="button"
              className="volteador revelada"
              aria-pressed={true}
              aria-label={carta.name}
              initial={reducido ? false : { rotateY: 180 }}
              animate={{ rotateY: 0 }}
              transition={{ duration: niveles[i]! >= 4 ? 0.7 : 0.35 }}
            >
              <CartaConBrillo imagePath={carta.imagePath} nombre={carta.name} nivel={niveles[i]!} acabado={acabadoDe(carta.finish)} />
            </motion.button>
          ))}
        </div>

        {!sellado && mazo.length > 0 && (
          <div className="ritual-mazo">
            {mazo.map((carta, i) => (
              <motion.button
                key={carta.slotIndex}
                layoutId={`carta-${openingId}-${carta.slotIndex}`}
                type="button"
                className={i === 0 && estado.fase === 'anticipacion' ? `volteador reverso-${game.toLowerCase()} anticipando nivel-${niveles[estado.reveladas]}` : `volteador reverso-${game.toLowerCase()}`}
                aria-pressed={false}
                aria-label={ES.ritual.sinRevelar(estado.reveladas + i + 1)}
                disabled={i !== 0}
                onClick={() => despachar({ tipo: 'siguiente' })}
                style={{ zIndex: mazo.length - i, translate: `${i * 2}px ${i * -2}px` }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **2. Sus estilos**, al final de `brillos.css`:

```css
/* --------------------------------------------------------- el ritual (H9e-4) */
.ritual-escena { position: relative; min-block-size: 420px; display: grid; gap: 18px; justify-items: center; padding: 12px 0; }
.ritual-pista { margin: 0; color: var(--texto-tenue); font-size: var(--paso-00); z-index: 1; }
.ritual-bandeja {
  inline-size: 100%; display: grid; gap: 12px; z-index: 1;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
/* Sin `scale`: la prueba de T-040 lee m11 de la matriz para saber si el giro
   termino, y una escala lo falsearia. El tamano lo pone la rejilla. */
.ritual-bandeja .volteador { padding: 0; border: 0; background: none; transform-style: preserve-3d; }
.ritual-mazo { position: relative; inline-size: 180px; block-size: 252px; z-index: 1; }
.ritual-mazo .volteador {
  position: absolute; inset: 0; border-radius: 10px; border: 1px solid var(--cristal-borde);
  background: linear-gradient(160deg, var(--dorso-1), var(--dorso-2) 55%, var(--dorso-3));
  box-shadow: 0 18px 36px rgb(0 0 0 / 0.55);
}
.ritual-mazo .volteador:not(:disabled) { cursor: pointer; }
.volteador.anticipando { animation: ritual-temblor 0.12s linear infinite; }
.volteador.anticipando.nivel-4 { box-shadow: 0 0 50px var(--nivel-4); }
.volteador.anticipando.nivel-5 { box-shadow: 0 0 70px var(--nivel-5), 0 0 120px var(--nivel-4); }
@keyframes ritual-temblor { 0%, 100% { translate: 0 0 } 25% { translate: -2px 1px } 75% { translate: 2px -1px } }
/* La luz se apaga durante la anticipacion. */
.ritual[data-fase="anticipacion"] .ritual-escena::before {
  content: ""; position: absolute; inset: 0; background: rgb(0 0 0 / 0.45); z-index: 0; border-radius: var(--radio-g);
}
```

- [ ] **3. La página.** En `Sobres.tsx`: sustituir el import de `PackReveal` por
      `import { Ritual } from '../components/apertura/Ritual.js';`, calcular
      `const setElegido = abribles.find((s) => s.id === setId) ?? null;`, y sustituir el
      `aperturas.map(...)` por:

```tsx
      {aperturas.map((a, i) => (
        <Ritual
          key={a.openingId}
          game={game}
          cards={a.cards}
          tiers={tiers}
          openingId={a.openingId}
          seed={a.seed}
          set={setElegido}
          // Ritual completo en el primero; en los demas, modo rapido (spec 7).
          rapido={i > 0}
        />
      ))}
```

      y `git rm apps/web/src/components/PackReveal.tsx`.

- [ ] **4. El ayudante E2E** (corrección 3 del plan). En `e2e/src/sobres.spec.ts`, `abrirUnSobre`
      recibe si hay que rasgar y lo hace; las aserciones no se tocan:

```ts
async function abrirUnSobre(page: Page, nombreDeSet: string, rasgar = true): Promise<void> {
  // ...todo lo que ya hace, sin cambios, hasta el expect de la region...
  await expect(sobre(page)).toBeVisible();
  // H9e: el sobre llega SELLADO. Con movimiento reducido no hay sobre que rasgar.
  if (rasgar) await sobre(page).getByRole('button', { name: /^Rasgar el sobre/ }).click();
}
```

      En el primer test, `abrirUnSobre(page, set.name)`; en el de movimiento reducido,
      `abrirUnSobre(page, set.name, false)`.

- [ ] **5. Ver la suite entera.** Con la API y la web locales:

```bash
cd e2e && E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test --reporter=line
```

      Esperado: 16 passed. Si falla `el volteo TERMINA`, mirar el orden del DOM y el `scale` antes que
      nada.

- [ ] **6. Mirarlo**: abrir una caja de *151* (24) y buscar una carta de nivel 4 o 5 para ver la
      anticipación y los rayos. Medir con el panel de rendimiento: 60 fps en escritorio.
- [ ] **7. Commit:** `feat(web): the full opening ritual on the packs page (T-106)`

---

## T-107 · Las pruebas del ritual, vistas fallar, y el cierre

**Ficheros**
- Crear: `e2e/src/ritual.spec.ts`
- Modificar: `001Reportes/*`, `005Registro/`, `00Master/05_Continuar_Aqui.md`, `Claude.md`, `README.md`

- [ ] **1. Las pruebas** (`ritual.spec.ts`):

```ts
import type { Browser, Page } from '@playwright/test';
import { API, test, expect, iniciarSesion, setAbribleDeYgo, type SetAbrible } from './fixtures.js';

/** El sobre abierto: la region "Sobre #N" (T-095). */
const region = (page: Page) => page.getByRole('region', { name: /^Sobre #/ });

async function abrir(page: Page, juego: 'YGO' | 'PTCG', set: Pick<SetAbrible, 'name'>): Promise<void> {
  await page.goto('/sobres');
  await page.getByRole('combobox', { name: 'Juego' }).selectOption(juego);
  await page.getByRole('combobox', { name: 'Cantidad de sobres' }).selectOption('1');
  await page.getByRole('button', { name: /^Set:/ }).click();
  await page.getByRole('listbox', { name: 'Set' }).getByRole('option', { name: set.name }).first().click();
  await page.getByRole('button', { name: 'Abrir' }).click();
  await expect(region(page)).toBeVisible();
}

async function contexto(browser: Browser, movimiento: 'reduce' | 'no-preference') {
  const ctx = await browser.newContext({ reducedMotion: movimiento });
  return { page: await ctx.newPage(), cerrar: () => ctx.close() };
}

test('el ritual entero se hace con el teclado', async ({ page, request, usuario }) => {
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);

  await region(page).getByRole('button', { name: /^Rasgar el sobre/ }).focus();
  await page.keyboard.press('Enter');

  // Carta a carta: la de arriba del mazo es siempre la primera "sin revelar".
  const arriba = region(page).getByRole('button', { name: /sin revelar$/ }).first();
  for (let i = 0; i < 20 && (await arriba.count()) > 0; i += 1) {
    await arriba.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1400); // cubre la anticipacion (1,2 s) si toca
  }
  await expect(region(page).locator('button[aria-pressed="false"]')).toHaveCount(0);
});

test('Saltar revela todo y va al resumen', async ({ page, request, usuario }) => {
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);

  await region(page).getByRole('button', { name: 'Saltar' }).click();
  await expect(region(page).locator('button[aria-pressed="false"]')).toHaveCount(0);
  await expect(region(page).getByRole('button', { name: 'Saltar' })).toHaveCount(0);
});

test('con movimiento reducido no hay lienzo de efectos', async ({ browser, request, usuario }) => {
  const { page, cerrar } = await contexto(browser, 'reduce');
  try {
    const set = await setAbribleDeYgo(request);
    await iniciarSesion(page, usuario.token);
    await abrir(page, 'YGO', set);
    await expect(region(page).locator('canvas')).toHaveCount(0);
  } finally {
    await cerrar();
  }
});

test('el sobre no lleva ninguna URL externa (P-001)', async ({ page, request, usuario }) => {
  const set = await setAbribleDeYgo(request);
  await iniciarSesion(page, usuario.token);
  await abrir(page, 'YGO', set);
  const html = await region(page).evaluate((el) => el.outerHTML);
  expect(html.match(/https?:\/\/(?!localhost)[^"'\s)]+/g)).toBeNull();
});

test('el sobre de 151 lleva el arte de Scarlet & Violet', async ({ page, request, usuario }) => {
  // Lo que comprueba es que el arte sale de la MISMA plantilla que el motor
  // (T-101): si las dos consultas se separaran, esto lo diria.
  const res = await request.get(`${API}/api/games/PTCG/sets`);
  const { data } = (await res.json()) as { data: Array<SetAbrible & { externalId: string }> };
  const s151 = data.find((s) => s.externalId === 'sv3pt5' && s.isOpenable && s.poolSize > 0);
  expect(s151, 'falta 151 en el catalogo: ingesta PTCG').toBeTruthy();

  await iniciarSesion(page, usuario.token);
  await abrir(page, 'PTCG', s151!);
  await expect(region(page).getByRole('button', { name: /^Rasgar el sobre/ })).toHaveAttribute(
    'data-art-key',
    'booster-scarlet-violet',
  );
});
```

- [ ] **2. Ver que pasan:** 21 passed (16 + 5).

- [ ] **3. Verlas fallar, una por una** — rompiendo y restaurando, como en T-095:

| Garantía | Rotura | Debe fallar |
|---|---|---|
| Teclado | `Sobre` como `motion.div` en vez de `motion.button` | el ritual entero se hace con el teclado |
| Saltar | el `onClick` de Saltar no despacha nada | Saltar revela todo |
| Sin lienzo con movimiento reducido | `CapaDeEfectos` sin el `if (reducido) return null` | con movimiento reducido no hay lienzo |
| Ninguna URL externa | `rutaDeArte` devuelve `https://cdn.example.org/...` con una clave en `DISPONIBLES` | el sobre no lleva ninguna URL externa |
| Arte = plantilla del motor | `ORDEN_DE_PLANTILLA` con la ventana (3) antes que la línea (2) **sólo en `listSets`** | el sobre de 151 lleva el arte… (y `arte-de-sobre.test.ts`) |

- [ ] **4. El Vault.** T-098 a T-107 a `Tareas_Realizadas.md`, cabecera de pendientes cuadrada, H9e
      cerrado en `03_Hitos.md` y en `Tareas_Pendientes.md`, el recuento de recorridos E2E (21) en
      `README.md` y en `05_Continuar_Aqui.md`, el mapa de `Claude.md` (`components/apertura/`,
      `lib/rareza`, `lib/ritual`, `cli/paleta`, la 0028, el doc 19), y bitácora de la sesión.
- [ ] **5. `npm test`, la suite E2E, `npm audit` y `npm run vault:mutar`** en verde.
- [ ] **6. Commit:** `test(e2e): the opening ritual, every guarantee seen failing (T-107)`

---

## Cierre del hito

- [ ] El criterio de cierre del spec, **mirado**: abrir sobres de *151* hasta ver un SIR con el ritual
      entero —sellado, rasgado, mazo, anticipación, rayos— en el navegador.
- [ ] Presupuestos medidos y apuntados en la bitácora: fps en escritorio, KB comprimidos que añaden
      `components/apertura/` y `brillos.css`, peso de cada ilustración que haya llegado.
- [ ] Revisar la pregunta que deja H9e: ¿la escalera de brillos se ve igual de bien en Magic y Yu-Gi-Oh!
      que en Pokémon? Mirar una mítica de *Bloomburrow* y una Starlight antes de dar el nivel por bueno.
