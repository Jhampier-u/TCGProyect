import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { imageUrl } from '../lib/api.js';
import { ES } from '../i18n/es.js';

export interface OpcionDeSet {
  id: string;
  nombre: string;
  /** Ruta LOCAL del icono. Nula si no se ha cosechado (T-035). */
  iconPath: string | null;
  /** Texto pequeno a la derecha: "281 cartas", por ejemplo. */
  detalle?: string;
}

interface Props {
  opciones: OpcionDeSet[];
  valor: string;
  onCambio: (id: string) => void;
  /** Texto cuando no hay nada elegido. */
  vacio: string;
  /** Nombre accesible del control. */
  etiqueta: string;
  deshabilitado?: boolean;
}

/**
 * Desplegable de sets con icono (T-066).
 *
 * POR QUE NO UN `<select>`. Los iconos llevan cosechados desde S027 y la API los
 * sirve en `iconPath`, pero no se veian: un `<option>` no puede contener una
 * imagen. Ninguna cantidad de CSS arregla eso, asi que o se cambia el control o
 * los iconos no existen para el usuario.
 *
 * LO QUE HAY QUE DEVOLVER AL CAMBIARLO. Un `<select>` nativo trae gratis cosas
 * que se dan por hechas hasta que faltan, y aqui se reimplementan a proposito:
 *
 *   - Rol y estado: `combobox` + `listbox`, con `aria-expanded`, `aria-selected`
 *     y `aria-activedescendant`, para que un lector de pantalla diga lo mismo.
 *   - Teclado completo: flechas, Inicio/Fin, Enter, Espacio, Escape y Tab.
 *   - Buscar tecleando: escribir "sup" salta a "Supreme Darkness". En una lista
 *     de 900 sets, sin esto el control es inservible con teclado.
 *   - Cerrar al hacer clic fuera y devolver el foco al boton.
 *
 * LO QUE NO SE RECUPERA, y conviene saberlo: en movil, un `<select>` nativo abre
 * la ruleta del sistema, que es mejor que cualquier lista que se pinte en la
 * pagina. Este control se comporta igual en los dos sitios; si algun dia molesta
 * en movil, la salida es volver al nativo por debajo de cierto ancho, no
 * apedazar este.
 *
 * ANCHURA: `min-width: 0` y `max-width: 100%` en la hoja de estilos. El
 * `<select>` anterior se dimensionaba a su opcion mas larga y se salia de su
 * columna (P-030). Un control propio no hereda ese comportamiento, pero tampoco
 * hereda la leccion: se fija explicitamente.
 */
export function SelectorDeSet({
  opciones,
  valor,
  onCambio,
  vacio,
  etiqueta,
  deshabilitado = false,
}: Props): JSX.Element {
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const tecleado = useRef<{ texto: string; cuando: number }>({ texto: '', cuando: 0 });
  const idBase = useId();

  // La opcion vacia es una entrada mas de la lista: asi "ninguno" se elige con
  // el mismo teclado que las demas en vez de ser un caso aparte.
  const todas = useMemo<OpcionDeSet[]>(
    () => [{ id: '', nombre: vacio, iconPath: null }, ...opciones],
    [opciones, vacio],
  );
  const elegida = todas.find((o) => o.id === valor) ?? todas[0]!;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent): void => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  // El resaltado tiene que verse. Con 900 sets, abrir en el elegido y no
  // desplazar la lista hasta el deja al usuario mirando el principio.
  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector('[data-resaltado="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [abierto, resaltado]);

  function abrir(indice = todas.findIndex((o) => o.id === valor)): void {
    setResaltado(indice < 0 ? 0 : indice);
    setAbierto(true);
  }

  function elegir(indice: number): void {
    const opcion = todas[indice];
    if (!opcion) return;
    onCambio(opcion.id);
    setAbierto(false);
    boton.current?.focus();
  }

  /** Salta a la primera opcion que empieza por lo tecleado. */
  function saltarPorTexto(tecla: string): void {
    const ahora = Date.now();
    // Un segundo de pausa empieza una busqueda nueva, como hace el nativo.
    const texto = ahora - tecleado.current.cuando > 1000 ? tecla : tecleado.current.texto + tecla;
    tecleado.current = { texto, cuando: ahora };

    const objetivo = texto.toLowerCase();
    const encontrado = todas.findIndex((o) => o.nombre.toLowerCase().startsWith(objetivo));
    if (encontrado >= 0) {
      if (abierto) setResaltado(encontrado);
      else elegir(encontrado);
    }
  }

  function alTeclear(e: React.KeyboardEvent): void {
    if (deshabilitado) return;

    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        abrir();
        return;
      }
    } else {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setResaltado((i) => Math.min(i + 1, todas.length - 1));
          return;
        case 'ArrowUp':
          e.preventDefault();
          setResaltado((i) => Math.max(i - 1, 0));
          return;
        case 'Home':
          e.preventDefault();
          setResaltado(0);
          return;
        case 'End':
          e.preventDefault();
          setResaltado(todas.length - 1);
          return;
        case 'Enter':
        case ' ':
          e.preventDefault();
          elegir(resaltado);
          return;
        case 'Escape':
          e.preventDefault();
          setAbierto(false);
          boton.current?.focus();
          return;
        case 'Tab':
          // Tab NO se intercepta: cerrar y dejarlo pasar es lo que hace el
          // nativo, y atraparlo aqui dejaria al teclado encerrado en el control.
          setAbierto(false);
          return;
        default:
          break;
      }
    }

    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      saltarPorTexto(e.key);
    }
  }

  return (
    <div className="selector-set" ref={contenedor}>
      <button
        type="button"
        ref={boton}
        className="selector-set-boton"
        disabled={deshabilitado}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={etiqueta}
        {...(abierto ? { 'aria-activedescendant': `${idBase}-${resaltado}` } : {})}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={alTeclear}
      >
        <IconoDeSet opcion={elegida} />
        <span className="selector-set-nombre">{elegida.nombre}</span>
        <span className="selector-set-flecha" aria-hidden="true">
          {ES.simbolo.desplegar}
        </span>
      </button>

      {abierto && (
        <ul className="selector-set-lista" role="listbox" aria-label={etiqueta} ref={lista}>
          {todas.map((o, i) => (
            <li
              key={o.id || '(ninguno)'}
              id={`${idBase}-${i}`}
              role="option"
              aria-selected={o.id === valor}
              data-resaltado={i === resaltado}
              className="selector-set-opcion"
              // `onMouseDown` y no `onClick`: el `mousedown` de cerrar-al-hacer-
              // clic-fuera se dispara antes y desmontaria la lista sin elegir.
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(i);
              }}
              onMouseEnter={() => setResaltado(i)}
            >
              <IconoDeSet opcion={o} />
              <span className="selector-set-nombre">{o.nombre}</span>
              {o.detalle && <span className="selector-set-detalle">{o.detalle}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * El icono, o un hueco del mismo tamano.
 *
 * El hueco no es decorativo: sin el, las filas con icono y sin icono no alinean
 * sus nombres y la lista se lee peor que sin iconos.
 */
function IconoDeSet({ opcion }: { opcion: OpcionDeSet }): JSX.Element {
  const src = imageUrl(opcion.iconPath);
  if (!src) return <span className="selector-set-icono" aria-hidden="true" />;
  return (
    <img
      className="selector-set-icono"
      src={src}
      // Vacio a proposito: el nombre del set va al lado, en texto. Repetirlo lo
      // haria sonar dos veces en un lector de pantalla.
      alt=""
      loading="lazy"
    />
  );
}
