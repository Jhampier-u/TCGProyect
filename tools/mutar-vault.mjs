#!/usr/bin/env node
/**
 * `npm run vault:mutar` - demuestra que la comprobacion del Vault NO es vacua.
 *
 * Reintroduce, una a una, las derivas REALES que se encontraron A MANO en las
 * sesiones S028-S031, y exige que `tools/vault-consistency.test.ts` falle en
 * cada caso. Restaura siempre.
 *
 * POR QUE ESTO EXISTE Y NO BASTA CON QUE EL TEST PASE. Un test que nunca ha
 * visto un fallo no ha demostrado nada. Y no es teoria: la comprobacion de "un
 * documento vivo publica un recuento de tests" nacio MUERTA -- un heredoc
 * convirtio su `\b` en un byte 0x08 de verdad, `/\d+ tests<BS>/`, que no casa
 * con nada -- y pasaba en verde. La destapo esta herramienta, no la lectura.
 *
 * NO SE EJECUTA EN `npm test`: edita ficheros del repositorio. Se lanza a mano
 * y se niega a arrancar si el arbol de trabajo esta sucio, para que un fallo a
 * mitad nunca se confunda con un cambio tuyo.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const escribir = (p, s) => writeFileSync(join(RAIZ, p), s, 'utf8');

function arbolLimpio() {
  const salida = execFileSync('git', ['status', '--porcelain'], { cwd: RAIZ, encoding: 'utf8' });
  return salida.trim() === '';
}

/** true si la comprobacion del Vault FALLA, que es lo que se espera al mutar. */
function detecta() {
  // Sin `shell: true`: Node avisa (DEP0190) de que los argumentos se concatenan
  // sin escapar. En Windows el ejecutable es `npx.cmd`, y nombrarlo evita a la
  // vez el shell y el aviso.
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const r = spawnSync(npx, ['vitest', 'run', 'tools/vault-consistency.test.ts'], {
    cwd: RAIZ,
    stdio: 'ignore',
  });
  return r.status !== 0;
}

/** Suma `d` al numero que captura el primer grupo: la mutacion vale con cualquier recuento. */
const desplazar = (d) => (todo, n) => todo.replace(n, String(Number(n) + d));

/**
 * Cada entrada es una deriva que de verdad ocurrio, con la sesion que la sufrio.
 *
 * Las que tocan un RECUENTO buscan con expresion regular y desplazan el numero
 * que haya. Hasta S037 buscaban el literal de S031 -- "Cerrados:** 39", "Total
 * abiertas:** 0", "los 10 recorridos" -- y en cuanto el recuento cambio dejaron
 * de aplicarse: tres llevaban sesiones muertas. Una mutacion atada al valor de
 * un dia caduca con el.
 */
const MUTACIONES = [
  ['recuento de problemas (S031)', '003Problemas/Registro_Problemas.md',
    /\*\*Cerrados:\*\* (\d+)/, desplazar(-1)],

  ['P-008 vuelve a la lista de abiertos (S031)', '00Master/05_Continuar_Aqui.md',
    '| **P-016** | ', '| **P-008** | limitaciones aceptadas |\n| **P-016** | '],

  ['cabecera de pendientes (S031)', '001Reportes/Tareas_Pendientes.md',
    /\*\*Total abiertas:\*\* (\d+)/, desplazar(+1)],

  ['un hito COMPLETADO que sigue EN CURSO (S031)', '001Reportes/Tareas_Pendientes.md',
    '## Hito H8 — Endurecimiento ✅ COMPLETADO (S028)', '## Hito H8 — Endurecimiento 🟡 EN CURSO'],

  ['una cita a un fichero que no existe', 'README.md',
    '## Comandos', 'Ver `99_Spec_Inventado.md`.\n\n## Comandos'],

  ['el mapa pierde una migracion (S031)', 'Claude.md',
    '0026_the_list_y_slot_de_tierra.{up,down}.sql', '0026_borrada_del_mapa.sql'],

  ['el indice del diccionario se queda atras (S031)', '00Master/04_Diccionario_Datos.md',
    '`idx_prints_pool (set_id, rarity_id, in_boosters, withdrawn_at, id)`',
    '`idx_prints_pool (set_id, rarity_id, in_boosters, id)`'],

  ['db/README se queda en una migracion vieja (S031)', 'db/README.md',
    '0026_the_list_y_slot_de_tierra', '0006_ygo_modern_booster'],

  ['recorridos E2E desfasados (S031)', 'README.md',
    /los (\d+) recorridos E2E/, desplazar(-4)],

  ['un documento vivo publica un recuento de tests (S031)', 'README.md',
    /Suite de Vitest y los (\d+)/, (_todo, n) => `411 tests y los ${n}`],

  ['una tarea cita una sesion sin bitacora (S035, S036)', '001Reportes/Tareas_Realizadas.md',
    /(\| T-092 \|[^\n]*\| )S036( \|)/, (_todo, a, b) => `${a}S099${b}`],
];

if (!arbolLimpio()) {
  console.error('El arbol de trabajo tiene cambios sin guardar.');
  console.error('Esta herramienta edita ficheros del repositorio: haz commit o stash antes.');
  process.exit(2);
}

const noDetectadas = [];

for (const [nombre, fichero, viejo, nuevo] of MUTACIONES) {
  const original = leer(fichero);
  const aplica = typeof viejo === 'string' ? original.includes(viejo) : viejo.test(original);
  if (!aplica) {
    console.log(`  ??    ${nombre}  -- el texto ya no esta en ${fichero}`);
    noDetectadas.push(`${nombre} (la mutacion no se pudo aplicar)`);
    continue;
  }
  let detectada = false;
  try {
    escribir(fichero, original.replace(viejo, nuevo));
    detectada = detecta();
  } finally {
    escribir(fichero, original);
  }
  console.log(`  ${detectada ? 'ok  ' : 'PASA'}  ${nombre}`);
  if (!detectada) noDetectadas.push(nombre);
}

// Y una que no es una edicion sino un fichero de mas: dos documentos de
// arquitectura compartiendo numero, que es lo que paso con el 12.
const duplicado = '004Arquitectura/11_Duplicado_De_Prueba.md';
let dupDetectada = false;
try {
  escribir(duplicado, '# duplicado de prueba\n');
  dupDetectada = detecta();
} finally {
  rmSync(join(RAIZ, duplicado), { force: true });
}
console.log(`  ${dupDetectada ? 'ok  ' : 'PASA'}  numeracion duplicada en 004Arquitectura (S031)`);
if (!dupDetectada) noDetectadas.push('numeracion duplicada');

console.log('');
if (noDetectadas.length > 0) {
  console.error('LA COMPROBACION DEL VAULT ES VACUA EN:');
  for (const n of noDetectadas) console.error(`   ${n}`);
  process.exit(1);
}
console.log(`Las ${MUTACIONES.length + 1} derivas historicas se detectan.`);
