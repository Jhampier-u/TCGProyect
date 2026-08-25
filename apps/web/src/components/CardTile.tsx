import { imageUrl } from '../lib/api.js';

export interface CardTileProps {
  name: string;
  rarity: string;
  imagePath: string | null;
  setCode?: string;
  collectorNumber?: string;
  quantity?: number;
  isNew?: boolean;
  finish?: string;
}

/**
 * Una carta en la rejilla.
 *
 * La imagen sale SIEMPRE de `/images/...`, servido por nuestro backend desde el
 * almacen local. Nunca se construye una URL hacia el origen: eso es lo que
 * castiga YGOPRODeck con lista negra de IP (P-001).
 */
export function CardTile(props: CardTileProps) {
  const src = imageUrl(props.imagePath);

  return (
    <article className="carta">
      <div className="carta-imagen">
        {src ? (
          // `loading="lazy"`: una pagina de catalogo son 40 imagenes y el
          // usuario solo ve las primeras.
          <img src={src} alt={props.name} loading="lazy" />
        ) : (
          <span className="sin-imagen">sin imagen cosechada</span>
        )}
      </div>
      <div className="carta-pie">
        <div className="carta-nombre" title={props.name}>{props.name}</div>
        <div className="carta-meta">
          <span className="etiqueta">{props.rarity.replace(/_/g, ' ')}</span>
          <span>
            {props.quantity !== undefined && <span className="etiqueta cantidad">x{props.quantity}</span>}
            {props.finish === 'foil' && <span className="etiqueta foil">foil</span>}
            {props.isNew && <span className="etiqueta nueva">nueva</span>}
            {props.quantity === undefined && !props.isNew && props.setCode && (
              <>{props.setCode} {props.collectorNumber}</>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}
