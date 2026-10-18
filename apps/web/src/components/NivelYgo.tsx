import { FLECHAS, flechasDeLink, marcaDeNivel } from '../lib/ygo.js';
import { ES } from '../i18n/es.js';

/**
 * Nivel, rango o link (H9f): una sola imagen para el lector de pantalla
 * ("Rango 4"), y a la vista estrella llena, estrella hueca o "LINK-2".
 */
export function NivelYgo({ frame, level, linkVal }: { frame: string | null; level: number | null; linkVal: number | null }) {
  const marca = marcaDeNivel(frame, level, linkVal);
  if (!marca) return <span className="tenue">{ES.simbolo.vacio}</span>;
  return (
    <span className={`nivel-ygo nivel-ygo-${marca.clase}`} role="img" aria-label={ES.ygo[marca.clase](marca.valor)}>
      <span aria-hidden="true">{ES.ygo.corto[marca.clase](marca.valor)}</span>
    </span>
  );
}

/**
 * Las flechas de un Link en su rejilla de 3x3, con el valor en el centro.
 * Dibujadas en CSS. Sin flechas conocidas no pinta nada.
 */
export function FlechasLink({ markers, valor }: { markers: readonly string[] | null | undefined; valor: number }) {
  const activas = flechasDeLink(markers);
  if (activas.length === 0) return null;
  return (
    <span className="flechas-link" role="img" aria-label={ES.ygo.flechas(activas.map((f) => ES.ygo.flecha[f] ?? f))}>
      {FLECHAS.map((f, i) =>
        f === null ? (
          <span key={i} className="flechas-centro" aria-hidden="true">{valor}</span>
        ) : (
          <span key={f} className="flecha" data-direccion={f} data-activa={activas.includes(f)} aria-hidden="true" />
        ),
      )}
    </span>
  );
}
