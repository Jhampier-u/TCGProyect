import { describe, it, expect } from 'vitest';
import type { DomainPrint, DomainSet, GameAdapter, IngestWarning, PackTemplateSpec } from '@tcg/shared';
import { IngestService, type IngestRepository } from './ingest-service.js';

/** Repositorio en memoria que registra el ORDEN de las operaciones. */
class FakeRepo implements IngestRepository {
  readonly sets: DomainSet[] = [];
  readonly guardadas = new Map<number, DomainPrint[]>();
  readonly marcados: number[] = [];
  readonly operaciones: string[] = [];
  pendientes: Array<{ id: number; externalId: string }> = [];

  async upsertSets(sets: DomainSet[]): Promise<void> {
    this.sets.push(...sets);
    this.operaciones.push(`upsertSets(${sets.length})`);
  }
  async findPendingSets(): Promise<Array<{ id: number; externalId: string }>> {
    return this.pendientes;
  }
  async savePrints(_game: never, setId: number, prints: DomainPrint[]): Promise<number> {
    const previas = this.guardadas.get(setId) ?? [];
    this.guardadas.set(setId, [...previas, ...prints]);
    this.operaciones.push(`savePrints(${setId}, ${prints.length})`);
    return prints.length;
  }
  /** Lo que se pidio retirar, por set. Vacio = no se llamo. */
  retiradas: Array<{ setId: number; vigentes: string[] }> = [];

  async retirarImpresionesAusentes(
    setId: number,
    vigentes: ReadonlySet<string>,
  ): Promise<{ borradas: number; retiradas: number }> {
    this.retiradas.push({ setId, vigentes: [...vigentes].sort() });
    this.operaciones.push(`retirar(${setId}, ${vigentes.size})`);
    return { borradas: 0, retiradas: 0 };
  }

  async markSetIngested(setId: number): Promise<void> {
    this.marcados.push(setId);
    this.operaciones.push(`markSetIngested(${setId})`);
  }
}

function set(externalId: string): DomainSet {
  return {
    game: 'MTG', externalId, code: externalId, name: `Set ${externalId}`,
    releasedAt: '2024-01-01', cardCount: 10, iconUrl: null,
  };
}

function print(setExternalId: string, id: string): DomainPrint {
  return {
    card: { game: 'MTG', oracleKey: `oracle-${id}`, name: `Carta ${id}`, typeLine: null, rulesText: null, gameData: {} },
    setExternalId, externalId: id, collectorNumber: id,
    rarityCode: 'common', rarityLabel: 'common',
    imageSourceUrl: null, finishes: ['nonfoil'], inBoosters: true,
  };
}

/** Adaptador incremental. Puede fallar en sets concretos. */
class FakeAdapter implements GameAdapter {
  readonly game = 'MTG' as const;
  constructor(
    private readonly sets: DomainSet[],
    private readonly prints: Record<string, DomainPrint[]> = {},
    private readonly fallaEn: Set<string> = new Set(),
  ) {}
  async *fetchSets(): AsyncIterable<DomainSet> {
    for (const s of this.sets) yield s;
  }
  async *fetchPrints(s: DomainSet): AsyncIterable<DomainPrint> {
    if (this.fallaEn.has(s.externalId)) throw new Error(`HTTP 500 en ${s.externalId}`);
    for (const p of this.prints[s.externalId] ?? []) yield p;
  }
  defaultPackTemplate(): PackTemplateSpec | null {
    return null;
  }
}

/** Adaptador con capacidad de volcado masivo, como Scryfall. */
class FakeBulkAdapter extends FakeAdapter {
  constructor(sets: DomainSet[], private readonly todas: DomainPrint[]) {
    super(sets);
  }
  supportsBulk(): boolean {
    return true;
  }
  async *fetchAllPrints(): AsyncIterable<DomainPrint> {
    for (const p of this.todas) yield p;
  }
}

describe('descubrimiento de sets', () => {
  it('persiste los sets ANTES de pedir impresiones', async () => {
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 1, externalId: 'blb' }];
    const adapter = new FakeAdapter([set('blb')], { blb: [print('blb', 'a')] });

    await new IngestService({ repository: repo }).ingest(adapter);

    // Sin set_id no se pueden insertar impresiones: el orden no es negociable.
    expect(repo.operaciones[0]).toBe('upsertSets(1)');
    expect(repo.operaciones[1]).toBe('savePrints(1, 1)');
  });

  it('no hace nada mas si no queda ningun set pendiente', async () => {
    const repo = new FakeRepo();
    repo.pendientes = [];
    const report = await new IngestService({ repository: repo }).ingest(
      new FakeAdapter([set('blb')]),
    );

    expect(report.setsDescubiertos).toBe(1);
    expect(report.setsProcesados).toBe(0);
    expect(repo.guardadas.size).toBe(0);
  });
});

describe('reanudabilidad (ADR-004)', () => {
  it('marca el set SOLO despues de guardar todas sus impresiones', async () => {
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 7, externalId: 'blb' }];
    const adapter = new FakeAdapter([set('blb')], { blb: [print('blb', 'a'), print('blb', 'b')] });

    await new IngestService({ repository: repo }).ingest(adapter);

    const iGuardar = repo.operaciones.findIndex((o) => o.startsWith('savePrints'));
    const iMarcar = repo.operaciones.findIndex((o) => o.startsWith('markSetIngested'));
    // Al reves, un fallo a mitad dejaria el set como completo con la mitad de
    // las cartas, y nadie volveria a mirarlo.
    expect(iGuardar).toBeLessThan(iMarcar);
  });

  it('NO marca un set cuyo origen ha fallado', async () => {
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 1, externalId: 'roto' }];
    const adapter = new FakeAdapter([set('roto')], {}, new Set(['roto']));

    const report = await new IngestService({ repository: repo }).ingest(adapter);

    expect(repo.marcados).toEqual([]); // la proxima ejecucion lo reintentara
    expect(report.setsFallidos).toBe(1);
    expect(report.errores[0]!.motivo).toContain('HTTP 500');
  });
});

describe('aislamiento de fallos', () => {
  it('un set roto NO impide ingestar los demas', async () => {
    const repo = new FakeRepo();
    repo.pendientes = [
      { id: 1, externalId: 'a' },
      { id: 2, externalId: 'roto' },
      { id: 3, externalId: 'c' },
    ];
    const adapter = new FakeAdapter(
      [set('a'), set('roto'), set('c')],
      { a: [print('a', 'a1')], c: [print('c', 'c1')] },
      new Set(['roto']),
    );

    const report = await new IngestService({ repository: repo }).ingest(adapter);

    expect(report.setsProcesados).toBe(2);
    expect(report.setsFallidos).toBe(1);
    expect(repo.marcados).toEqual([1, 3]);
    // Y el que va DESPUES del roto tambien se procesa.
    expect(repo.guardadas.get(3)).toHaveLength(1);
  });

  it('avisa si un set esta en la base de datos pero el origen ya no lo lista', async () => {
    const avisos: IngestWarning[] = [];
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 99, externalId: 'fantasma' }];
    const adapter = new FakeAdapter([set('blb')]);

    await new IngestService({ repository: repo, onWarning: (w) => avisos.push(w) }).ingest(adapter);

    expect(avisos[0]!.message).toContain('fantasma');
    expect(repo.marcados).toEqual([]);
  });
});

describe('camino masivo', () => {
  it('usa el volcado cuando el adaptador lo ofrece', async () => {
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 1, externalId: 'blb' }, { id: 2, externalId: 'dsk' }];
    const adapter = new FakeBulkAdapter(
      [set('blb'), set('dsk')],
      [print('blb', 'a'), print('dsk', 'b'), print('blb', 'c')],
    );

    const report = await new IngestService({ repository: repo }).ingest(adapter);

    expect(report.via).toBe('bulk');
    expect(report.impresiones).toBe(3);
    expect(repo.guardadas.get(1)).toHaveLength(2);
    expect(repo.guardadas.get(2)).toHaveLength(1);
    expect(repo.marcados.sort()).toEqual([1, 2]);
  });

  it('IGNORA del volcado los sets que ya estaban ingestados', async () => {
    // Releer el volcado no debe reescribir lo que ya se ingesto.
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 1, externalId: 'blb' }];
    const adapter = new FakeBulkAdapter(
      [set('blb'), set('viejo')],
      [print('blb', 'a'), print('viejo', 'x'), print('viejo', 'y')],
    );

    const report = await new IngestService({ repository: repo }).ingest(adapter);

    expect(report.impresiones).toBe(1);
    expect(repo.guardadas.has(2)).toBe(false);
  });

  it('se puede forzar el camino incremental', async () => {
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 1, externalId: 'blb' }];
    const adapter = new FakeBulkAdapter([set('blb')], [print('blb', 'a')]);

    const report = await new IngestService({ repository: repo, preferIncremental: true }).ingest(adapter);

    // Sin volcado: el adaptador falso incremental no devuelve nada para 'blb'.
    expect(report.via).toBe('incremental');
  });
});

describe('acotacion del trabajo', () => {
  it('respeta maxSetsPerRun', async () => {
    const repo = new FakeRepo();
    const muchos = Array.from({ length: 100 }, (_, i) => set(`s${i}`));
    // El repositorio real aplica el LIMIT; aqui se comprueba que se le pasa.
    let limiteRecibido = -1;
    repo.findPendingSets = async (_g: never, limit: number) => {
      limiteRecibido = limit;
      return [];
    };

    await new IngestService({ repository: repo, maxSetsPerRun: 5 }).ingest(new FakeAdapter(muchos));
    expect(limiteRecibido).toBe(5);
  });
});

describe('retirada de impresiones que el origen ya no lista (T-083)', () => {
  it('pasa TODOS los external_id del set, no solo el ultimo lote', async () => {
    // Es el fallo que este metodo tiene que evitar: el buffer se vacia cada 500
    // impresiones, asi que si se mirara solo lo que queda al final, todo lo
    // anterior pareceria sobrante y se borraria.
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 1, externalId: 'a' }];
    const adapter = new FakeAdapter([set('a')], {
      a: [print('a', 'x1'), print('a', 'x2'), print('a', 'x3')],
    });

    await new IngestService({ repository: repo, maxSetsPerRun: 5 }).ingest(adapter);

    expect(repo.retiradas).toHaveLength(1);
    expect(repo.retiradas[0]!.vigentes).toEqual(['x1', 'x2', 'x3']);
  });

  it('retira ANTES de marcar el set como ingestado', async () => {
    // El orden importa: marcar primero dejaria el set como completo con filas
    // sobrantes dentro si la retirada fallara.
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 1, externalId: 'a' }];
    const adapter = new FakeAdapter([set('a')], { a: [print('a', 'x1')] });

    await new IngestService({ repository: repo, maxSetsPerRun: 5 }).ingest(adapter);

    const iRetirar = repo.operaciones.findIndex((o) => o.startsWith('retirar('));
    const iMarcar = repo.operaciones.findIndex((o) => o.startsWith('markSetIngested('));
    expect(iRetirar).toBeGreaterThanOrEqual(0);
    expect(iRetirar).toBeLessThan(iMarcar);
  });

  it('NO retira nada si el origen no devolvio ninguna impresion', async () => {
    // La salvaguarda que importa. Un fallo de red a mitad no puede vaciar un set
    // entero: sin esta condicion, una respuesta vacia por un 500 arrasaria el
    // catalogo del set en silencio.
    const repo = new FakeRepo();
    repo.pendientes = [{ id: 1, externalId: 'a' }];
    const adapter = new FakeAdapter([set('a')], { a: [] });

    await new IngestService({ repository: repo, maxSetsPerRun: 5 }).ingest(adapter);

    // Y el set SI se proceso: sin esto la prueba pasaria tambien si la ingesta
    // no hubiera mirado el set siquiera, que es como se escribio la primera vez.
    expect(repo.marcados).toEqual([1]);
    expect(repo.retiradas).toEqual([]);
  });
});
