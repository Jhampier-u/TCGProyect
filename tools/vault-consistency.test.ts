import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * T-087 - la deriva documental, convertida en test.
 *
 * POR QUE EXISTE. Este proyecto persigue en el codigo una forma de fallo muy
 * concreta -- algo que dice una cosa y hace otra -- y lleva tres sesiones
 * encontrandola en los DOCUMENTOS, no en el codigo:
 *
 *   S028  P-005 llevaba doce sesiones diciendo "pendiente" de un arreglo hecho.
 *   S031  `Tareas_Bloqueadas.md` llevaba VEINTISEIS sesiones citando una
 *         credencial que ya habia llegado.
 *   S031  El diccionario describia `idx_prints_pool` sin `withdrawn_at`, tres
 *         sesiones despues de que la 0024 lo rehiciera.
 *   S031  Una fila del stack decia "Cypress" ocho sesiones despues de que
 *         ADR-009 lo sustituyera por Playwright.
 *
 * Las doce se encontraron A MANO, mirando. Un documento que no se revisa no es
 * neutral: miente con autoridad, y este Vault es el contrato de operacion del
 * proyecto entero.
 *
 * QUE COMPRUEBA Y QUE NO. Solo lo MECANICO: recuentos que se contradicen a si
 * mismos, ficheros citados que no existen, numeraciones duplicadas, indices que
 * ya no son los que dice la migracion. NO comprueba prosa. "Quedan 3
 * limitaciones acotadas" siendo cero, o un diagrama que nombra un PRNG que el
 * codigo no usa, siguen necesitando ojos. Se dice aqui para que nadie lea un
 * verde y crea que el Vault esta revisado.
 */

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');
const listar = (rel: string) => readdirSync(join(RAIZ, rel));

const PROBLEMAS = leer('003Problemas/Registro_Problemas.md');
const PENDIENTES = leer('001Reportes/Tareas_Pendientes.md');
const REALIZADAS = leer('001Reportes/Tareas_Realizadas.md');
const CONTINUAR = leer('00Master/05_Continuar_Aqui.md');
const HITOS = leer('00Master/03_Hitos.md');
const DICCIONARIO = leer('00Master/04_Diccionario_Datos.md');
const ORQUESTADOR = leer('Claude.md');
const README = leer('README.md');
const DB_README = leer('db/README.md');

const MIGRACIONES = listar('db/migrations');
const BITACORAS = listar('005Registro');

/** Los `## P-NNN` del registro, con el estado que dice su linea `**Estado:**`. */
function problemas(): Array<{ id: string; abierto: boolean }> {
  const salida: Array<{ id: string; abierto: boolean }> = [];
  const lineas = PROBLEMAS.split('\n');

  for (let i = 0; i < lineas.length; i += 1) {
    const cabecera = /^## (P-\d+)\b/.exec(lineas[i]!);
    if (!cabecera) continue;

    // El estado va en las lineas siguientes, no en la cabecera: P-016 se titula
    // `## P-016 🟠 · ...`, sin la palabra, y solo `**Estado:**` lo dice siempre.
    const estado = lineas.slice(i + 1, i + 5).find((l) => l.startsWith('**Estado:**'));
    if (!estado) throw new Error(`${cabecera[1]} no tiene linea **Estado:**`);
    salida.push({ id: cabecera[1]!, abierto: /\bABIERTO\b/.test(estado) });
  }
  return salida;
}

describe('recuentos del registro de problemas', () => {
  const todos = problemas();
  const abiertos = todos.filter((p) => p.abierto).map((p) => p.id);
  const cerrados = todos.filter((p) => !p.abierto).map((p) => p.id);

  it('la cabecera dice los numeros que hay', () => {
    // El separador va como escape Unicode y no como caracter: es lo que la
    // regla de ASCII puro prescribe para el no-ASCII que el codigo necesita
    // de verdad, y aqui hace falta porque la cabecera del registro lo lleva.
    const m = /\*\*Abiertos:\*\* (\d+) \u00b7 \*\*Cerrados:\*\* (\d+) \u00b7 \*\*Total:\*\* (\d+)/
      .exec(PROBLEMAS);
    expect(m, 'la cabecera del registro no tiene la forma esperada').not.toBeNull();

    expect({
      abiertos: Number(m![1]),
      cerrados: Number(m![2]),
      total: Number(m![3]),
    }).toEqual({
      abiertos: abiertos.length,
      cerrados: cerrados.length,
      total: todos.length,
    });
  });

  it('los ids son unicos y no dejan huecos', () => {
    const numeros = todos.map((p) => Number(p.id.slice(2))).sort((a, b) => a - b);
    expect(new Set(numeros).size, 'hay un P-NNN repetido').toBe(numeros.length);
    expect(numeros).toEqual(Array.from({ length: numeros.length }, (_, i) => i + 1));
  });

  it('el punto de entrada lista EXACTAMENTE los problemas abiertos', () => {
    // Es la comprobacion que habria cazado el caso real: P-008 se cerro en S030
    // y `05_Continuar_Aqui.md` -- el fichero que se lee primero -- siguio
    // listandolo como abierto, con el recuento equivocado al lado.
    const seccion = /## 6\. Problemas abiertos[\s\S]*?(?=\n## |\n---\n)/.exec(CONTINUAR);
    expect(seccion, 'no encuentro la seccion de problemas abiertos').not.toBeNull();

    const citados = [...seccion![0].matchAll(/^\| \*\*(P-\d+)\*\*/gm)].map((m) => m[1]!);
    expect([...citados].sort()).toEqual([...abiertos].sort());
  });
});

describe('recuentos de tareas', () => {
  const enPendientes = [...PENDIENTES.matchAll(/^\| (T-\d+[a-z]?) \|/gm)].map((m) => m[1]!);
  const enRealizadas = [...REALIZADAS.matchAll(/^\| (T-\d+[a-z]?) \|/gm)].map((m) => m[1]!);

  it('la cabecera de pendientes dice las que hay', () => {
    const m = /\*\*Total abiertas:\*\* (\d+)/.exec(PENDIENTES);
    expect(m, 'la cabecera de pendientes no tiene la forma esperada').not.toBeNull();
    expect(Number(m![1])).toBe(enPendientes.length);
  });

  it('ninguna tarea esta a la vez pendiente y realizada', () => {
    const hechas = new Set(enRealizadas);
    expect(enPendientes.filter((t) => hechas.has(t))).toEqual([]);
  });

  it('ninguna tarea aparece dos veces en realizadas', () => {
    const vistas = new Set<string>();
    const repetidas = enRealizadas.filter((t) => (vistas.has(t) ? true : (vistas.add(t), false)));
    expect(repetidas).toEqual([]);
  });
});

describe('los hitos dicen lo mismo en los dos sitios', () => {
  it('ninguno esta COMPLETADO en 03_Hitos y EN CURSO en Tareas_Pendientes', () => {
    // El caso real: H8 se cerro en S028 y `Tareas_Pendientes.md` siguio
    // encabezando su seccion con "🟡 EN CURSO" tres sesiones despues.
    const completados = [...HITOS.matchAll(/\*\*(H\d)\*\*[^\n]*COMPLETADO/g)].map((m) => m[1]!);
    expect(completados.length, 'no encuentro hitos completados en 03_Hitos').toBeGreaterThan(0);

    const enCurso = completados.filter((h) =>
      new RegExp(`^## Hito ${h}\\b[^\\n]*EN CURSO`, 'm').test(PENDIENTES),
    );
    expect(enCurso).toEqual([]);
  });
});

describe('lo que el Vault cita, existe', () => {
  const DONDE = ['00Master', '001Reportes', '002Agents', '003Problemas', '004Arquitectura', '005Registro'];

  it('todo fichero nombrado entre comillas existe', () => {
    const textos = [ORQUESTADOR, README, DB_README, ...DONDE.flatMap((d) =>
      listar(d).filter((f) => f.endsWith('.md')).map((f) => leer(join(d, f))))];

    const citados = new Set<string>();
    for (const t of textos) {
      for (const m of t.matchAll(/`(\d{2}_[A-Za-z0-9_]+\.md|\d{4}_[a-z0-9_]+\.(?:up|down)\.sql)`/g)) {
        citados.add(m[1]!);
      }
    }
    expect(citados.size, 'no he encontrado ni una cita: el patron esta mal').toBeGreaterThan(10);

    const fantasmas = [...citados].filter((n) => {
      if (n.endsWith('.sql')) return !MIGRACIONES.includes(n);
      return !DONDE.some((d) => existsSync(join(RAIZ, d, n)));
    });
    expect(fantasmas.sort()).toEqual([]);
  });

  it('el mapa de Claude.md lista todas las migraciones y todas las bitacoras', () => {
    const faltan = [
      ...MIGRACIONES.filter((f) => f.endsWith('.up.sql'))
        .map((f) => f.replace('.up.sql', ''))
        .filter((n) => !ORQUESTADOR.includes(n)),
      ...BITACORAS.filter((f) => !ORQUESTADOR.includes(f)),
    ];
    expect(faltan.sort()).toEqual([]);
  });
});

describe('numeracion sin colisiones', () => {
  it.each([
    ['004Arquitectura', /^(\d{2})_/],
    ['005Registro', /_S(\d{3})_/],
  ])('%s no repite un numero', (carpeta, patron) => {
    // El caso real: `12_Spec_H8b_Seguridad.md` (S024) y
    // `12_Spec_T034_PlantillasPorEpoca.md` (S028) compartian el 12, y el mapa
    // solo listaba el segundo.
    const numeros = listar(carpeta)
      .map((f) => patron.exec(f)?.[1])
      .filter((n): n is string => n !== undefined);
    expect(numeros.length, `${carpeta}: el patron no casa con nada`).toBeGreaterThan(0);

    const repetidos = numeros.filter((n, i) => numeros.indexOf(n) !== i);
    expect([...new Set(repetidos)].sort()).toEqual([]);
  });

  it('cada migracion tiene su rollback y no faltan numeros', () => {
    const ups = MIGRACIONES.filter((f) => f.endsWith('.up.sql'));
    const sinDown = ups.filter((f) => !MIGRACIONES.includes(f.replace('.up.sql', '.down.sql')));
    expect(sinDown).toEqual([]);

    // Las semillas 0002 y 0003 son `.sql` a secas, idempotentes y sin rollback.
    const numeros = MIGRACIONES.filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .map((f) => Number(f.slice(0, 4)))
      .sort((a, b) => a - b);
    expect(numeros).toEqual(Array.from({ length: numeros.length }, (_, i) => i + 1));
  });
});

describe('lo que el diccionario dice del esquema sigue siendo verdad', () => {
  it('los indices que describe son los que crea la ultima migracion que los toca', () => {
    // El caso real: la 0024 rehizo `idx_prints_pool` para meter `withdrawn_at` y
    // el diccionario siguio describiendo el indice anterior durante tres
    // sesiones. Se detecto comparandolo con `information_schema` a mano.
    const definiciones = new Map<string, string>();
    for (const f of MIGRACIONES.filter((n) => n.endsWith('.sql')).sort()) {
      const sql = leer(join('db/migrations', f));
      for (const m of sql.matchAll(/CREATE\s+INDEX\s+(\w+)\s+ON\s+\w+\s*\(([^)]*)\)/gi)) {
        definiciones.set(m[1]!, m[2]!.split(',').map((c) => c.trim()).join(', '));
      }
    }
    expect(definiciones.size, 'no he leido ni un CREATE INDEX').toBeGreaterThan(0);

    const desfasados: string[] = [];
    for (const [nombre, columnas] of definiciones) {
      const citado = new RegExp(`\`${nombre} \\(([^)]*)\\)\``).exec(DICCIONARIO);
      if (!citado) continue; // el diccionario no lo menciona: nada que comprobar
      const dice = citado[1]!.split(',').map((c) => c.trim()).join(', ');
      if (dice !== columnas) desfasados.push(`${nombre}: el diccionario dice (${dice}), la migracion crea (${columnas})`);
    }
    expect(desfasados).toEqual([]);
  });

  it('db/README menciona la migracion mas reciente', () => {
    // Su tabla se quedo parada en la 0006 durante veinte migraciones.
    const ultima = MIGRACIONES.filter((f) => f.endsWith('.sql')).sort().at(-1)!.slice(0, 4);
    expect(DB_README, `db/README.md no menciona la migracion ${ultima}`).toContain(ultima);
  });
});

describe('los recuentos de pruebas que el Vault publica', () => {
  it('el numero de recorridos E2E es el que hay', () => {
    const specs = listar('e2e/src').filter((f) => f.endsWith('.spec.ts'));
    const reales = specs.reduce(
      (n, f) => n + [...leer(join('e2e/src', f)).matchAll(/^test\(/gm)].length,
      0,
    );
    expect(reales, 'no he contado ni un test de Playwright').toBeGreaterThan(0);

    const citados = [README, CONTINUAR].flatMap((t) =>
      [...t.matchAll(/(\d+) recorridos E2E/g)].map((m) => Number(m[1])));
    expect(citados.length, 'ningun documento publica el numero de recorridos').toBeGreaterThan(0);
    for (const n of citados) expect(n).toBe(reales);
  });

  it('ningun documento vivo publica un recuento de tests de Vitest', () => {
    // NO se vigila que el numero sea correcto: se prohibe el numero.
    //
    // Desde dentro de la propia suite no hay forma de saber cuantos tests tiene
    // -- `it.each` multiplica casos en tiempo de ejecucion -- asi que una cifra
    // publicada en un documento es una promesa que nadie puede comprobar. El
    // README dijo 341 durante seis sesiones; al escribir esta comprobacion los
    // documentos decian 411 y la suite ya iba por 427, ella incluida.
    //
    // La cifra de recorridos E2E si se publica, y por eso la prueba de arriba
    // puede exigir que sea la de verdad: esa se cuenta leyendo los ficheros.
    //
    // Las bitacoras de `005Registro` quedan fuera a proposito: son registro
    // historico y su numero era cierto el dia que se escribio.
    const vivos: Array<[string, string]> = [
      ['README.md', README],
      ['05_Continuar_Aqui.md', CONTINUAR],
      ['Tareas_Pendientes.md', PENDIENTES],
    ];
    // Sin \b a proposito. La primera version lo llevaba y un heredoc de Python lo
    // convirtio en un BYTE 0x08 de verdad, que no casa con nada: la
    // comprobacion nacio muerta y solo la destapo el banco de mutaciones. Es
    // exactamente el motivo de la regla de ASCII puro de este proyecto -- un
    // caracter de control en el fuente no se ve al leerlo.
    const publican = vivos
      .filter(([, t]) => /\d+ tests/.test(t))
      .map(([n]) => n);
    expect(publican, 'un recuento de tests en un documento vivo se queda viejo solo').toEqual([]);
  });
});
