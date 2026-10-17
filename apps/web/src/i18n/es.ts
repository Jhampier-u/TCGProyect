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
 * navegacion, el acceso y los simbolos --, los simbolos de coleccion y mazos, y
 * desde T-093 el catalogo entero. La prosa de Sobres y Coleccion NO se ha
 * movido a proposito: H9c las reescribe, y traducir dos veces el mismo parrafo
 * es trabajo tirado. Cada pagina trae sus cadenas aqui cuando le toque.
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
    /** "La tienes", en una columna donde una palabra no cabe. */
    check: '✓',
    /** Quitar un filtro. Va con su nombre accesible: la cruz sola no dice qué quita. */
    cerrar: '×',
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
    etiquetaSet: 'Set',
    todosLosSets: 'Todos los sets',
    todoElJuego: 'Todo el catálogo',
    cartasDelContexto: (n: number) => (n === 1 ? '1 carta' : `${n} cartas`),
    progreso: (tengo: number, total: number) => `Llevas ${tengo} de ${total}`,
    cargando: 'Cargando cartas…',
    error: 'No se pudo cargar el catálogo.',
    sinResultados: 'Ninguna carta cumple todos estos filtros.',
    sinResultadosAyuda: 'Quita alguno con su ×, o todos a la vez.',
    cargarMas: 'Cargar más',
    cargandoMas: 'Cargando…',
    mostrando: (n: number, hayMas: boolean) => `${n}${hayMas ? '+' : ''} ${n === 1 ? 'carta' : 'cartas'}`,
    filtrosActivos: 'Filtros activos',
    filtros: (n: number) => (n > 0 ? `Filtros (${n})` : 'Filtros'),
    quitarFiltro: (etiqueta: string) => `Quitar el filtro ${etiqueta}`,
    quitarTodos: 'Quitar todos',
    busqueda: (q: string) => `«${q}»`,
    entraParaFaltan: 'Inicia sesión para filtrar las que te faltan.',
    entrar: 'Iniciar sesión',
    columnas: {
      numero: 'Nº',
      carta: 'Carta',
      tipo: 'Tipo',
      ps: 'PS',
      rareza: 'Rareza',
      marca: 'Marca',
      tienes: 'Tienes',
    },
    laTienes: 'La tienes',
    teFalta: 'Te falta',
    sinImagen: 'Sin imagen',
    ps: (n: number) => `${n} PS`,
  },

  /**
   * El raíl de estructura (T-093, D-5 del spec): navegación, información y
   * filtro a la vez. Cada fila dice cuántas hay —y cuántas tienes— antes de
   * pulsarla, que es lo que hace que no haya que explicarlo.
   */
  rail: {
    titulo: 'Estructura',
    tenencia: 'Tu colección',
    todas: 'Todas',
    meFaltan: 'Me faltan',
    lasTengo: 'Las tengo',
    categoria: 'Categoría',
    tipo: 'Tipo',
    rareza: 'Rareza',
    marca: 'Marca de regulación',
    sinMarca: 'Sin marca',
    /** La ausencia se explica, no se pinta como hueco (spec §2). */
    sinMarcaNota: 'Anteriores a 2019: la marca aún no existía.',
    deTotal: (tengo: number, total: number) => `${tengo} de ${total}`,
  },

  /** La ficha de carta (T-094). */
  ficha: {
    cerrar: 'Cerrar',
    cargando: 'Cargando la carta…',
    error: 'No se pudo cargar esta carta.',
    numeroEnSet: (set: string, numero: string) => `${set} · nº ${numero}`,
    ps: 'PS',
    evolucionaDe: (nombre: string) => `Evoluciona de ${nombre}`,
    habilidades: 'Habilidades',
    ataques: 'Ataques',
    coste: (tipos: string[]) => (tipos.length === 0 ? 'Sin coste' : `Coste: ${tipos.join(', ')}`),
    debilidad: 'Debilidad',
    resistencia: 'Resistencia',
    retirada: 'Retirada',
    ninguna: 'Ninguna',
    reglas: 'Reglas',
    marca: 'Marca de regulación',
    /** La ausencia se explica (spec §2): antes de 2019 la marca no existía. */
    marcaAnterior: (anio: string) => `Sin marca: la carta es de ${anio} y las marcas empezaron en 2019.`,
    marcaNinguna: 'Esta carta no lleva marca de regulación.',
    publicadaEtiqueta: 'Publicada',
    acabados: 'Acabados',
    enSobres: 'Sale en los sobres de su set.',
    fueraDeSobres: 'No sale en los sobres de su set.',
    laTienes: 'La tienes en tu colección.',
    noLaTienes: 'Aún no la tienes.',
    anadirAMazo: 'Añadir a un mazo',
    elegirMazo: 'Mazo',
    anadir: 'Añadir',
    anadiendo: 'Añadiendo…',
    anadida: (mazo: string, copias: number) =>
      `Añadida a «${mazo}». Ahora lleva ${copias} ${copias === 1 ? 'copia' : 'copias'}.`,
    errorAnadir: 'No se pudo añadir al mazo.',
    sinMazos: 'Aún no tienes mazos de este juego.',
    crearMazo: 'Crear un mazo',
    entraParaMazos: 'Inicia sesión para añadirla a un mazo.',
  },

  /**
   * Los valores de Pokémon tal como llegan del origen, en inglés, y cómo se
   * leen aquí. La clave es el dato; el valor es lo que se pinta.
   */
  pokemon: {
    tipo: {
      Grass: 'Planta',
      Fire: 'Fuego',
      Water: 'Agua',
      Lightning: 'Rayo',
      Psychic: 'Psíquico',
      Fighting: 'Lucha',
      Darkness: 'Oscuro',
      Metal: 'Metal',
      Dragon: 'Dragón',
      Fairy: 'Hada',
      Colorless: 'Incoloro',
    } as Record<string, string>,
    supertipo: {
      'Pokémon': 'Pokémon',
      Trainer: 'Entrenador',
      Energy: 'Energía',
    } as Record<string, string>,
    /** Orden fijo de las categorías: que no bailen cuando cambian los recuentos. */
    ordenSupertipo: ['Pokémon', 'Trainer', 'Energy'],
    marca: (m: string) => `Marca ${m}`,
  },

  coleccion: {
    completitudPorSet: 'Completitud por set',
    cartas: 'Cartas',
    completitud: (poseidas: number, total: number, porcentaje: string) =>
      `${poseidas}/${total}${ES.simbolo.separador}${porcentaje}%`,
  },

  /**
   * Nombres accesibles (T-095). Lo que un lector de pantalla anuncia de una
   * región o una lista, y por lo que la suite E2E las encuentra: un selector por
   * rol y nombre sobrevive a un rediseño; uno por clase CSS, no.
   */
  semantica: {
    juego: 'Juego',
    cantidadDeSobres: 'Cantidad de sobres',
    buscadorDeCartas: 'Buscador de cartas',
    buscarPorNombre: 'Buscar por nombre',
    resultados: 'Resultados',
    anadirCarta: (nombre: string) => `Añadir ${nombre}`,
    mazo: 'Tu mazo',
    problemasDelMazo: 'Problemas del mazo',
    lineasDeZona: (zona: string) => `Cartas en ${zona}`,
    tusMazos: 'Tus mazos',
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

  /** El ritual de apertura (H9e-4). */
  ritual: {
    /** El titulo de cada sobre, y el nombre de su region. */
    titulo: (id: number) => `Sobre #${id}`,
    rasgar: (set: string) => `Rasgar el sobre de ${set}`,
    pista: 'Arrastra por el borde para rasgarlo, o pulsa.',
    saltar: 'Saltar',
    sinRevelar: (n: number) => `Carta ${n} sin revelar`,
    nuevas: (n: number) => (n === 1 ? '1 nueva' : `${n} nuevas`),
    semilla: 'Semilla de la apertura: la hace reproducible',
    /** Lo que oye un lector de pantalla al revelarse una carta. */
    revelada: (carta: string, rareza: string) => `${carta} — ${rareza}`,
    /** Una sola linea al saltar, con movimiento reducido o en modo rapido. */
    resumen: (total: number, nuevas: number) =>
      `${total === 1 ? '1 carta' : `${total} cartas`}, ${nuevas === 1 ? '1 nueva' : `${nuevas} nuevas`}`,
    nueva: 'nueva',
    abrirOtro: 'Abrir otro',
    rarezasSinCargar: 'No se pudieron cargar las rarezas de este juego, y sin ellas el sobre no sabe en qué orden revelar.',
    reintentar: 'Reintentar',
  },

  error: {
    paginaNoEncontrada: 'Página no encontrada.',
    pantallaRota: 'Algo ha fallado en esta pantalla. El resto de la aplicación sigue funcionando.',
    recargar: 'Recargar',
  },
} as const;
