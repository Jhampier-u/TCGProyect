import { describe, it, expect } from 'vitest';
import { revisarAlmacen } from './store-check.js';

/** Comprobador de disco falso: existe lo que esté en el conjunto. */
function disco(presentes: string[]): { exists: (p: string) => Promise<boolean> } {
  const set = new Set(presentes);
  return { exists: async (p) => set.has(p) };
}

const RUTAS = [
  'ygo/mamo/mamo-en038-secret_rare.245.webp',
  'ygo/mamo/mamo-en001-ultra_rare.245.webp',
  'ptcg/sv1/sv1-16.245.webp',
  'mtg/blb/0000419b.245.webp',
];

describe('revisarAlmacen (T-071)', () => {
  it('con la raiz equivocada, NINGUNA muestra existe y lo llama por su nombre', async () => {
    // El caso real de P-036: 2000 impresiones con ruta en la base y 3101
    // ficheros escritos bajo otra raiz. El sintoma era un 404 por imagen.
    const r = await revisarAlmacen({
      declaradas: 2000,
      muestra: RUTAS,
      store: disco([]),
      storagePath: '/app/storage/cards',
    });

    expect(r.estado).toBe('raiz_equivocada');
    expect(r.mensaje).toContain('STORAGE_PATH');
    expect(r.mensaje).toContain('/app/storage/cards');
    expect(r.mensaje).toContain('2000');
  });

  it('con todo en su sitio no dice nada', async () => {
    const r = await revisarAlmacen({
      declaradas: 2000,
      muestra: RUTAS,
      store: disco(RUTAS),
      storagePath: '/app/storage/cards',
    });
    expect(r.estado).toBe('ok');
    expect(r.mensaje).toBe('');
  });

  it('unos pocos ficheros sueltos que faltan NO son un error de configuracion', async () => {
    // Una imagen borrada a mano no es lo mismo que la raiz equivocada, y
    // tratarlas igual convertiria el aviso en ruido hasta que nadie lo leyera.
    const r = await revisarAlmacen({
      declaradas: 2000,
      muestra: RUTAS,
      store: disco(RUTAS.slice(1)),
      storagePath: '/app/storage/cards',
    });
    expect(r.estado).toBe('faltan_ficheros');
    expect(r.mensaje).toContain('1 de 4');
  });

  it('una base sin imagenes declaradas no tiene nada que comprobar', async () => {
    // Es el clon recien hecho: la base esta vacia y el disco tambien.
    const r = await revisarAlmacen({
      declaradas: 0,
      muestra: [],
      store: disco([]),
      storagePath: '/app/storage/cards',
    });
    expect(r.estado).toBe('ok');
  });

  it('no acusa a la configuracion con una muestra vacia', async () => {
    // Si la base dice que hay imagenes pero la muestra viene vacia, el problema
    // es de la consulta, no del disco. Acusar a STORAGE_PATH mandaria a quien
    // lo lea a mirar donde no es.
    const r = await revisarAlmacen({
      declaradas: 2000,
      muestra: [],
      store: disco([]),
      storagePath: '/app/storage/cards',
    });
    expect(r.estado).toBe('ok');
  });
});
