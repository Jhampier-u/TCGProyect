/**
 * El texto que lee el usuario, en un solo sitio (T-089).
 *
 * ESTE FICHERO ES LA UNICA EXCEPCION A LA REGLA DE ASCII PURO del proyecto, y
 * esta declarada en `Claude.md`. La razon: es un modulo de DATOS, no de codigo.
 * No hay identificadores con acentos ni combinantes sueltos escondidos entre
 * operadores; hay cadenas, y una cadena que el usuario lee tiene que estar bien
 * escrita. `tools/ascii-fuente.test.ts` lo exime por ruta.
 *
 * POR QUE EXISTE. La interfaz decia "Catalogo", "Mi coleccion" y "Contrasena"
 * -- sin acentos -- porque la regla de ASCII, pensada para el codigo, se habia
 * colado en el texto. La regla es buena y no se toca; lo que se mueve es el
 * texto. De paso, es el primer paso necesario si algun dia se quiere el
 * catalogo en otro idioma.
 *
 * MIGRACION EN CURSO. Aqui esta lo que se lee en TODAS las pantallas -- la
 * navegacion, el acceso y los simbolos -- mas los simbolos que usan las paginas
 * de coleccion y mazos. La prosa de Catalogo, Sobres y Coleccion NO se ha
 * movido a proposito: H9b y H9c las reescriben enteras, y traducir dos veces el
 * mismo parrafo es trabajo tirado. Cada pagina trae sus cadenas aqui cuando le
 * toque el rediseno.
 */

export const ES = {
  /**
   * Simbolos, no palabras. Van aqui porque un separador tipografico ES texto
   * que se pinta, y porque tenerlos sueltos por los componentes es como se
   * acaba con tres separadores distintos en tres pantallas.
   */
  simbolo: {
    /** Entre trozos de metadatos: "Planta · Comun · 70 PS". */
    separador: ' · ',
    /** Valor que todavia no hay. No es un cero: es que no se sabe. */
    vacio: '—',
    /** La punta del desplegable. */
    desplegar: '▾',
  },

  navegacion: {
    marca: 'ProyectoTCG',
    catalogo: 'Catálogo',
    sobres: 'Abrir sobres',
    coleccion: 'Mi colección',
    mazos: 'Mis mazos',
    salir: 'Salir',
    acceder: 'Acceder',
  },

  acceso: {
    tituloEntrar: 'Acceder',
    tituloCrear: 'Crear cuenta',
    invitacionEntrar: 'Entra para abrir sobres y ver tu colección.',
    invitacionCrear: 'La contraseña debe tener al menos 10 caracteres.',
    correo: 'Correo',
    nombreVisible: 'Nombre visible',
    contrasena: 'Contraseña',
    enviando: 'Enviando…',
    yaTienesCuenta: '¿Ya tienes cuenta?',
    noTienesCuenta: '¿No tienes cuenta?',
    crearUna: 'Crear una',
    errorGenerico: 'No se pudo completar la operación',
  },

  inicio: {
    titulo: 'Elige tu juego',
    entradilla: 'Cada juego tiene su propia sección: su catálogo, sus mazos y su colección.',
    enCamino: 'En camino',
  },

  juegos: {
    ptcg: {
      nombre: 'Pokémon TCG',
      resumen: 'Álbum por bloques, del Base Set a Mega Evolution.',
    },
    mtg: {
      nombre: 'Magic: The Gathering',
      resumen: 'Treinta años de sobres, de Alpha al Play Booster.',
    },
    ygo: {
      nombre: 'Yu-Gi-Oh!',
      resumen: 'Core Boosters y seis líneas de producto paralelas.',
    },
  },

  portada: {
    cargando: 'Cargando el catálogo…',
    error: 'No se pudo cargar el catálogo.',
    entradilla: (sets: number, epocas: number) =>
      `${sets} sets repartidos en ${epocas} épocas.`,
    cuantosSets: (n: number) => (n === 1 ? '1 set' : `${n} sets`),

    /**
     * Como se PRESENTA una época cuyo nombre en la base no vale como título.
     *
     * Los nombres de `pack_templates` se escribieron para el motor de sobres y
     * viven en migraciones, que son ASCII puro y no llevan acentos. La mayoría
     * son nombres propios y salen tal cual —«Diamond & Pearl», «Sword &
     * Shield»—; los que son palabras españolas necesitan su tilde y su
     * mayúscula antes de encabezar una sección.
     *
     * Traducir aquí y no renombrar en la base es deliberado: el nombre de la
     * plantilla es un dato del motor y hay pruebas que lo usan para
     * identificarla. Presentarlo es trabajo de la interfaz.
     */
    nombreDeEpoca: (nombreEnBase: string): string => {
      const sinPrefijo = nombreEnBase.replace(/^Booster /, '');
      const PRESENTACION: Record<string, string> = {
        'clasico (hasta la era EX)': 'Clásico (hasta la era EX)',
        'Mega Evolution en adelante': 'Mega Evolution en adelante',
      };
      return PRESENTACION[sinPrefijo] ?? sinPrefijo;
    },
  },

  catalogo: {
    todasLasRarezas: 'Todas las rarezas',
    buscarPlaceholder: 'Buscar por nombre o texto…',
    buscar: 'Buscar',
  },

  coleccion: {
    completitudPorSet: 'Completitud por set',
    cartas: 'Cartas',
    completitud: (poseidas: number, total: number, porcentaje: string) =>
      `${poseidas}/${total}${ES.simbolo.separador}${porcentaje}%`,
  },

  mazos: {
    nombrePlaceholder: 'Nombre del mazo',
    principal: (n: number) => `main ${n}`,
    extra: (n: number) => `extra ${n}`,
    lateral: (n: number) => `side ${n}`,
    validacionLocal: 'la validación se recalcula en tu navegador, sin consultar al servidor',
  },

  buscador: {
    sinTipo: 'sin tipo',
    tienes: (n: number) => `tienes ${n}`,
  },

  error: {
    paginaNoEncontrada: 'Página no encontrada.',
  },
} as const;
