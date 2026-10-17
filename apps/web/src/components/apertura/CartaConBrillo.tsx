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
 * NO ES INTERACTIVA: no es un boton. Puede ir dentro de uno (el ritual de
 * apertura) o sola (la ficha de carta); dos controles anidados serian dos
 * paradas de tabulador para una sola cosa.
 */
export function CartaConBrillo({ imagePath, nombre, nivel, acabado }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const caja = useRef<DOMRect | null>(null);
  const cuadro = useRef(0);
  const src = imageUrl(imagePath);

  // El rect se lee una vez al entrar, no en cada movimiento.
  const entrar = () => {
    caja.current = ref.current?.getBoundingClientRect() ?? null;
  };

  const mover = (e: PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = caja.current ?? (caja.current = el.getBoundingClientRect());
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const max = INCLINACION[nivel];
    cancelAnimationFrame(cuadro.current);
    // Las cuatro variables se escriben juntas, una vez por cuadro.
    cuadro.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      el.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    });
  };

  const soltar = () => {
    cancelAnimationFrame(cuadro.current);
    caja.current = null;
    const el = ref.current;
    if (!el) return;
    for (const v of ['--mx', '--my']) el.style.setProperty(v, '50%');
    for (const v of ['--rx', '--ry']) el.style.setProperty(v, '0deg');
  };

  // Los niveles 1 y 2 no usan ni el puntero ni la inclinacion.
  const sigue = nivel >= 3;

  return (
    <span
      ref={ref}
      className={`carta-brillo carta-brillo-n${nivel} carta-brillo-${acabado}`}
      data-nivel={nivel}
      data-acabado={acabado}
      onPointerEnter={sigue ? entrar : undefined}
      onPointerMove={sigue ? mover : undefined}
      onPointerLeave={sigue ? soltar : undefined}
      onPointerCancel={sigue ? soltar : undefined}
    >
      {src ? <img src={src} alt={nombre} decoding="async" /> : <span className="sin-imagen">{nombre}</span>}
      <span className="carta-brillo-capa carta-brillo-efecto" aria-hidden="true" />
      <span className="carta-brillo-capa carta-brillo-reflejo" aria-hidden="true" />
      {acabado === 'foil' && <span className="carta-brillo-capa carta-brillo-foil" aria-hidden="true" />}
    </span>
  );
}
