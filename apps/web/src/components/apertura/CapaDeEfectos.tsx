import { useEffect, useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Nivel } from '../../lib/rareza.js';
import {
  avanzarParticulas, limitarDpr, limitarParticulas, medidorNuevo, registrarFotograma,
  type Medidor, type Particula,
} from '../../lib/efectos.js';

/** Particulas por nivel al revelar. Los niveles 1 y 2 no disparan nada. */
const PARTICULAS: Record<Nivel, number> = { 1: 0, 2: 0, 3: 24, 4: 48, 5: 120 };
/** Duracion de los rayos del nivel 5. */
const RAYOS_MS = 2500;
/** Opacidad de los rayos. */
const RAYOS_ALFA = 0.16;

interface Props {
  /** Cambia cada vez que se revela una carta que merece efecto. */
  disparo: number;
  nivel: Nivel;
}

/**
 * El lienzo de particulas y rayos (D-5): lo unico del ritual que no es DOM.
 *
 * NUNCA RECIBE CLICS (`pointer-events: none`) y no tiene contenido para un
 * lector de pantalla: es luz. Con movimiento reducido NO EXISTE -- ni se
 * monta --, y la suite lo comprueba. El bucle de dibujo solo corre mientras
 * hay algo que pintar (particulas vivas o rayos activos): en reposo el lienzo
 * se limpia una vez y no se pide ningun fotograma. Se para con la pestana
 * oculta, y si la media de los fotogramas cae por debajo de ~45 fps baja las
 * particulas: antes se degrada la luz que las cartas.
 */
export function CapaDeEfectos({ disparo, nivel }: Props) {
  const reducido = useReducedMotion() ?? false;
  const lienzo = useRef<HTMLCanvasElement>(null);
  /** El nivel vigente; el efecto de disparo lo lee sin depender de el. */
  const nivelActual = useRef(nivel);
  /** Ultimo disparo atendido: nace con el valor de montaje, asi montar nunca dispara. */
  const ultimo = useRef(disparo);
  useLayoutEffect(() => { nivelActual.current = nivel; }, [nivel]);
  const particulas = useRef<Particula[]>([]);
  const rayosHasta = useRef(0);
  const colorRayos = useRef('');
  const medidor = useRef<Medidor>(medidorNuevo());
  /** Pone en marcha el bucle si no corre; la instala el efecto del lienzo. */
  const arrancar = useRef<() => void>(() => {});

  useEffect(() => {
    if (reducido) return;
    const c = lienzo.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;

    let marco = 0;
    let anterior = 0;

    const ajustar = () => {
      const escala = limitarDpr(window.devicePixelRatio);
      c.width = Math.max(1, Math.round(c.clientWidth * escala));
      c.height = Math.max(1, Math.round(c.clientHeight * escala));
    };
    ajustar();
    const observador = new ResizeObserver(ajustar);
    observador.observe(c);

    const pintar = (ahora: number) => {
      marco = 0;
      if (document.hidden) return;
      // Primer fotograma tras arrancar: dt 0, no hay intervalo que medir ni simular.
      const dt = anterior !== 0 ? ahora - anterior : 0;
      if (anterior !== 0) medidor.current = registrarFotograma(medidor.current, dt);
      anterior = ahora;

      const escala = limitarDpr(window.devicePixelRatio);
      ctx.clearRect(0, 0, c.width, c.height);

      const hayRayos = ahora < rayosHasta.current && colorRayos.current !== '';
      if (hayRayos) {
        ctx.save();
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate(ahora / 2400);
        ctx.globalAlpha = RAYOS_ALFA;
        ctx.fillStyle = colorRayos.current;
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

      particulas.current = avanzarParticulas(particulas.current, dt, escala);
      for (const p of particulas.current) {
        ctx.globalAlpha = Math.max(0, p.vida);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2 * escala, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (hayRayos || particulas.current.length > 0) {
        marco = requestAnimationFrame(pintar);
      } else {
        // Nada que pintar: se limpia una vez y el bucle se detiene.
        ctx.clearRect(0, 0, c.width, c.height);
        anterior = 0;
      }
    };

    arrancar.current = () => {
      if (marco !== 0 || document.hidden) return;
      anterior = 0;
      marco = requestAnimationFrame(pintar);
    };

    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        cancelAnimationFrame(marco);
        marco = 0;
        anterior = 0;
      } else if (particulas.current.length > 0 || performance.now() < rayosHasta.current) {
        arrancar.current();
      }
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      cancelAnimationFrame(marco);
      marco = 0;
      observador.disconnect();
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      arrancar.current = () => {};
    };
  }, [reducido]);

  useEffect(() => {
    if (reducido || disparo === ultimo.current) return;
    ultimo.current = disparo;
    if (disparo === 0) return;
    const nivelRevelado = nivelActual.current;
    const c = lienzo.current;
    if (!c) return;
    const estilo = getComputedStyle(c);
    const leer = (n: number) => estilo.getPropertyValue(`--nivel-${n}`).trim();

    const color = leer(nivelRevelado);
    const n = Math.round(PARTICULAS[nivelRevelado] * medidor.current.carga);
    if (color !== '') {
      for (let i = 0; i < n; i += 1) {
        const angulo = Math.random() * Math.PI * 2;
        const fuerza = 1.5 + Math.random() * 4;
        particulas.current.push({
          x: c.width / 2, y: c.height / 2,
          vx: Math.cos(angulo) * fuerza, vy: Math.sin(angulo) * fuerza - 1,
          vida: 1, color,
        });
      }
    }
    if (nivelRevelado === 5) {
      colorRayos.current = leer(5);
      if (colorRayos.current !== '') rayosHasta.current = performance.now() + RAYOS_MS;
    }
    particulas.current = limitarParticulas(particulas.current);
    arrancar.current();
  }, [disparo, reducido]);

  if (reducido) return null;
  return <canvas ref={lienzo} className="capa-efectos" aria-hidden="true" />;
}
