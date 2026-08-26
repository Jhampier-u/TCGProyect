import { test as base, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * La API se llama directamente para montar precondiciones.
 *
 * Hacer login por formulario en cada test solo anade tiempo y motivos de fallo
 * ajenos a lo que se esta probando. El navegador se reserva para lo que esta
 * bajo prueba.
 */
export const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

/** Clave con la que `auth.tsx` guarda el token. */
const CLAVE_TOKEN = 'tcg.token';

export interface Usuario {
  email: string;
  token: string;
}

/**
 * UN usuario por ejecucion, no uno por test (T-072).
 *
 * Antes era uno por test, buscando que ninguno dependiera del estado de otro. La
 * intencion era buena y el precio aparecio al usarla: `/api/auth/register` admite
 * 20 altas por IP y hora (T-062), asi que con SEIS altas por vuelta la suite se
 * quedaba sin cupo a la tercera y fallaba con 429 en todos los tests a la vez.
 * Una suite que no se puede relanzar cuando hace falta deja de usarse, y
 * entonces no verifica nada. Medido: de 6 altas por vuelta a 1, contando filas
 * de `users` antes y despues.
 *
 * TIENE QUE SER UNA FIXTURE DE AMBITO WORKER. Una variable de modulo no vale:
 * Playwright carga los modulos de test de forma aislada, asi que el cache no
 * sobrevive de un test al siguiente. `scope: 'worker'` si vive lo que vive el
 * proceso del worker.
 *
 * QUE SE PIERDE. Los tests ya no arrancan de una cuenta virgen, y UNO SI
 * dependia de eso: "la lista de mazos muestra el mazo creado" exigia que la
 * lista tuviera exactamente una fila. Se arreglo el test, no la fixture, porque
 * su sujeto nunca fue cuantos mazos hay sino que el mazo creado aparece. Los
 * demas comprueban datos que ellos mismos crean con nombre propio, asi que
 * compartir cuenta no los toca. El correo cambia en cada vuelta, de modo que el
 * estado tampoco se arrastra de una ejecucion a la siguiente.
 *
 * LO QUE NO SE HACE es subir el limite en el entorno de la suite: bajarle la
 * guardia justo donde se prueba de verdad seria dejar de probar la guardia.
 */
export const test = base.extend<Record<string, never>, { usuario: Usuario }>({
  usuario: [
    async ({}, use, workerInfo) => {
      const request = await playwrightRequest.newContext();
      try {
        await use(await registrar(request, `w${workerInfo.workerIndex}`));
      } finally {
        await request.dispose();
      }
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';

async function registrar(request: APIRequestContext, etiqueta: string): Promise<Usuario> {
  const email = `e2e-${etiqueta}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const res = await request.post(`${API}/api/auth/register`, {
    data: { email, displayName: 'E2E', password: 'contrasena-larga-e2e-1' },
  });

  if (res.status() === 429) {
    // El mensaje por defecto ("retry in N minutes") no dice que se puede hacer,
    // y lo primero que uno piensa es que la suite esta rota.
    throw new Error(
      [
        'CUPO DE ALTAS AGOTADO: la API admite 20 registros por IP y hora (T-062) y esta',
        'ejecucion no tiene sitio. No es un fallo de la suite ni de la aplicacion: es el',
        'rate limiting funcionando. Los contadores viven en memoria, asi que se vacian',
        'con:  docker compose restart api',
        `Respuesta: ${await res.text()}`,
      ].join('\n'),
    );
  }
  if (!res.ok()) {
    throw new Error(`No se pudo crear el usuario de prueba: ${res.status()} ${await res.text()}`);
  }

  const cuerpo = (await res.json()) as { token: string };
  return { email, token: cuerpo.token };
}

export interface SetAbrible {
  id: number;
  name: string;
  poolSize: number;
  isOpenable: boolean;
}

/**
 * Precondicion de datos.
 *
 * La suite NO ingesta a proposito: hacerlo ataria cada ejecucion a tres APIs de
 * terceros, una de las cuales responde 200 solo el ~30 % de las veces (P-016).
 * Una suite que falla porque Pokemon esta caido no mide nada y ensena a ignorar
 * los rojos. Se comprueba y se falla ruidosamente con el comando exacto.
 */
export async function setAbribleDeYgo(request: APIRequestContext): Promise<SetAbrible> {
  const res = await request.get(`${API}/api/games/YGO/sets`);
  if (!res.ok()) {
    throw new Error(`La API no responde en ${API}: ${res.status()}`);
  }
  const { data } = (await res.json()) as { data: SetAbrible[] };
  // Las MISMAS dos condiciones que usa la pagina de sobres. Con solo `poolSize`
  // la fixture podria elegir un set que la aplicacion no ofrece -- una caja de
  // Structure Decks tiene pool de sobra (T-069) -- y el test fallaria acusando
  // a la interfaz de no pintar algo que hace bien en no pintar.
  const abrible = data.find((s) => s.poolSize > 0 && s.isOpenable);
  if (!abrible) {
    throw new Error(
      'FALTAN DATOS: no hay ningun set de Yu-Gi-Oh! con cartas abribles.\n' +
        'Ejecuta:  docker compose --profile ingest run --rm ingest --game YGO --sets 4',
    );
  }
  return abrible;
}

/**
 * Deja la sesion puesta antes de que la aplicacion arranque.
 *
 * `addInitScript` corre antes que el codigo de la pagina, asi que `AuthProvider`
 * ya encuentra el token al montarse. Rellenar el formulario funcionaria, pero
 * probaria el login en cada test en vez de probarlo una vez.
 */
export async function iniciarSesion(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([clave, valor]) => window.localStorage.setItem(clave, valor),
    [CLAVE_TOKEN, token] as const,
  );
}

/** Crea un mazo por API y devuelve su id. */
export async function crearMazo(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<number> {
  const res = await request.post(`${API}/api/decks`, {
    headers: { authorization: `Bearer ${token}` },
    data: { game: 'YGO', name },
  });
  if (!res.ok()) {
    throw new Error(`No se pudo crear el mazo: ${res.status()} ${await res.text()}`);
  }
  const cuerpo = (await res.json()) as { data: { id: number } };
  return cuerpo.data.id;
}

/**
 * Abre un sobre por API para dejar cartas en la coleccion.
 *
 * Existe para que el test del panel de completitud no dependa de que OTRO test
 * haya abierto sobres antes. Un test que se salta por falta de datos no prueba
 * nada, y uno que depende del orden de ejecucion falla el dia que ese orden
 * cambie.
 */
export async function abrirUnSobrePorApi(
  request: APIRequestContext,
  token: string,
  setId: number,
): Promise<void> {
  const res = await request.post(`${API}/api/packs/open`, {
    headers: { authorization: `Bearer ${token}` },
    data: { setId, count: 1 },
  });
  if (!res.ok()) {
    throw new Error(`No se pudo abrir el sobre de precondicion: ${res.status()} ${await res.text()}`);
  }
}
