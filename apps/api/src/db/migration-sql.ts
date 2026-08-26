export interface SqlLimpio {
  sql: string;
  /** Las sentencias retiradas, tal cual estaban, para poder decirlo. */
  quitadas: string[];
}

/**
 * Un `USE`, en una linea entera y suya. `USE `base`;` tambien.
 *
 * El anclaje a linea completa es lo que evita tocar un `USE` que viva dentro de
 * una cadena o de un comentario: en ninguno de los dos casos ocupa la linea
 * entera el solo.
 */
const USE_SUELTO = /^[ \t]*USE[ \t]+`?[A-Za-z0-9_$]+`?[ \t]*;[ \t]*$/gm;

/**
 * Un `CREATE DATABASE` completo, desde el principio de linea hasta su `;`.
 *
 * Ocupa varias lineas en la 0001 (lleva CHARACTER SET y COLLATE), asi que no
 * vale con una regla de linea.
 */
const CREATE_DATABASE = /^[ \t]*CREATE[ \t]+DATABASE\b[\s\S]*?;[ \t]*$/gim;

/**
 * Retira de una migracion las sentencias que deciden CONTRA QUE BASE se aplica
 * (T-065, corrige P-032).
 *
 * EL PROBLEMA. La migracion `0001` lleva dentro un `USE proyecto_tcg;`, asi que
 * el migrador se cambiaba de base solo, dijera lo que dijera `DATABASE_URL`.
 * Apuntar a otra base y migrar creaba las tablas en `proyecto_tcg` mientras
 * anotaba las migraciones como aplicadas en la otra: dos bases inconsistentes y
 * ningun error.
 *
 * POR QUE SE ARREGLA AQUI Y NO EN LA MIGRACION. Las migraciones publicadas son
 * inmutables: la 0001 esta aplicada en instalaciones que no controlamos, y
 * editarla haria que su contenido dejara de corresponderse con lo que aquellas
 * ejecutaron. Lo que si se puede cambiar es el migrador, que es codigo.
 *
 * En S025 esto se mitigo con una guarda en `db:migrate` que se negaba a arrancar
 * contra otra base. Servia para no hacer dano, pero dejaba el problema entero:
 * seguia siendo imposible migrar una base de pruebas. Ahora la regla es la que
 * deberia haber sido siempre: **una migracion describe un esquema, no elige
 * donde vive**. La base la decide la conexion, y sólo la conexion.
 *
 * `CREATE DATABASE` se va por el mismo motivo, y ademas no hacia falta: para
 * abrir la conexion con la que se migra, la base ya tiene que existir.
 */
export function quitarSentenciasDeBase(sql: string): SqlLimpio {
  const quitadas: string[] = [];

  const limpio = sql
    .replace(CREATE_DATABASE, (m) => {
      quitadas.push(m.trim());
      return '';
    })
    .replace(USE_SUELTO, (m) => {
      quitadas.push(m.trim());
      return '';
    });

  return { sql: limpio, quitadas };
}
