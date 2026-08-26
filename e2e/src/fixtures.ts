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
 * Crea un usuario nuevo con correo unico.
 *
 * Unico por ejecucion Y por test: sin estado compartido no hay orden obligatorio
 * entre tests, que es de donde sale la mitad de la intermitencia de una suite
 * E2E.
 */
export async function crearUsuario(request: APIRequestContext, etiqueta: string): Promise<Usuario> {
  const email = `e2e-${etiqueta}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const res = await request.post(`${API}/api/auth/register`, {
    data: { email, displayName: 'E2E', password: 'contrasena-larga-e2e-1' },
  });
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
  const abrible = data.find((s) => s.poolSize > 0);
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
