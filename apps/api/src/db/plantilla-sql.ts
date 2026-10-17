/**
 * Que plantilla de EPOCA o de LINEA corresponde a un set (H9e).
 *
 * Lo usan dos consultas que no pueden discrepar: `findTemplate`, que decide que
 * TRAE un sobre, y `listSets`, que decide que ARTE lleva. Si cada una tuviera
 * su copia, el sobre de un set ensenaria una epoca y traeria las cartas de otra
 * sin un solo error. Por eso el texto vive aqui una vez, y una prueba comprueba
 * que las dos lo incluyen literalmente.
 *
 * La subconsulta del catalogo NO exige `is_openable`: un set no abrible tambien
 * lleva artKey, porque el catalogo lo ensena. Y un set con plantilla propia
 * lleva el arte de su EPOCA, no el de su producto.
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

/**
 * La precedencia: set, linea, ventana, por defecto. Se desempata por `id`: sin
 * desempate, dos filas del mismo rango podrian elegirse distinto en cada
 * consulta, que es justo la deriva que este fragmento compartido evita.
 */
export const ORDEN_DE_PLANTILLA = (t: string, s: string): string => `CASE
      WHEN ${t}.set_id = ${s}.id THEN 1
      WHEN ${t}.product_line IS NOT NULL THEN 2
      WHEN ${t}.valid_from IS NOT NULL OR ${t}.valid_to IS NOT NULL THEN 3
      ELSE 4
    END, ${t}.id`;

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
