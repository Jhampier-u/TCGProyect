/** Lo minimo del almacen que hace falta para revisarlo. */
interface SoloExiste {
  exists(relativePath: string): Promise<boolean>;
}

export interface RevisionDeAlmacen {
  declaradas: number;
  /** Rutas de ejemplo sacadas de la base. Vacia si no hay ninguna. */
  muestra: readonly string[];
  store: SoloExiste;
  /** Solo para el mensaje: quien lo lea tiene que saber donde se ha mirado. */
  storagePath: string;
}

export interface Resultado {
  estado: 'ok' | 'raiz_equivocada' | 'faltan_ficheros';
  /** Vacio cuando no hay nada que decir. */
  mensaje: string;
}

/**
 * Comprueba que lo que la base dice sobre las imagenes cuadra con el disco
 * (T-071, corrige P-036).
 *
 * POR QUE EXISTE. `card_prints.image_local_path` guarda una ruta RELATIVA a
 * `STORAGE_PATH`, y la base no guarda en ningun sitio bajo que raiz se escribio
 * el fichero. Una cosecha lanzada con la raiz equivocada deja la base afirmando
 * que 2000 impresiones tienen imagen y la API devolviendo 404 en cada una, sin
 * que nada falle: el cosechador termina en verde y el servidor arranca sin
 * quejarse. En S028 pasaron 3101 imagenes.
 *
 * Y es contagioso: la salvaguarda del cosechador -- "si ya esta en disco, no lo
 * pidas al origen" -- consulta la raiz equivocada, asi que la siguiente
 * ejecucion volveria a pedir al origen todo lo que ya se tenia. Contra
 * YGOPRODeck eso es lo que P-001 lleva veinte sesiones evitando.
 *
 * SE DISTINGUEN DOS COSAS, y no es un detalle: que falten unos ficheros sueltos
 * (alguien borro uno, una cosecha a medias) es normal y no merece alarma. Que no
 * exista NI UNO de la muestra es un error de configuracion. Tratarlos igual
 * convertiria el aviso en ruido, y un aviso que sale siempre deja de leerse
 * (T-019).
 *
 * NO BLOQUEA EL ARRANQUE. Quien haya borrado `storage/` a proposito para volver
 * a cosechar tiene que poder levantar la API. Lo que no puede es no enterarse.
 */
export async function revisarAlmacen(entrada: RevisionDeAlmacen): Promise<Resultado> {
  const { declaradas, muestra, store, storagePath } = entrada;

  // Sin imagenes declaradas no hay nada que cuadrar: es el clon recien hecho.
  // Y con la muestra vacia teniendo declaradas, el problema esta en la consulta,
  // no en el disco: acusar a STORAGE_PATH mandaria a mirar donde no es.
  if (declaradas === 0 || muestra.length === 0) return { estado: 'ok', mensaje: '' };

  let encontradas = 0;
  for (const ruta of muestra) {
    if (await store.exists(ruta)) encontradas += 1;
  }

  if (encontradas === muestra.length) return { estado: 'ok', mensaje: '' };

  if (encontradas === 0) {
    return {
      estado: 'raiz_equivocada',
      mensaje:
        `La base dice que ${declaradas} impresiones tienen imagen y NINGUNA de las ` +
        `${muestra.length} comprobadas esta bajo "${storagePath}".\n` +
        '  Es casi seguro un STORAGE_PATH distinto del que se uso al cosechar (P-036).\n' +
        `  Ejemplo que se buscaba: ${muestra[0]}\n` +
        '  La API arrancara igual, pero devolvera 404 en cada imagen.',
    };
  }

  return {
    estado: 'faltan_ficheros',
    mensaje:
      `Faltan ${muestra.length - encontradas} de ${muestra.length} imagenes comprobadas ` +
      `bajo "${storagePath}". No parece un problema de configuracion; se recuperan con ` +
      '`npm run ingest -- --images-only`.',
  };
}
