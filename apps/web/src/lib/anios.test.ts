import { describe, it, expect } from 'vitest';
import { agruparPorAnio } from './anios.js';
import type { SetSummary } from './api.js';

const set = (id: number, releasedAt: string | null): SetSummary => ({
  id, externalId: `s${id}`, code: `S${id}`, name: `Set ${id}`, releasedAt, cardCount: 10,
  isOpenable: true, iconPath: null, poolSize: 10, palette: null, artKey: null,
});

describe('la portada por anio de salida (H9f, F-8)', () => {
  it('del mas reciente al mas antiguo, respetando el orden de dentro', () => {
    const g = agruparPorAnio([set(3, '2024-08-02'), set(1, '1993-08-05'), set(2, '2024-02-09')]);
    expect(g.map((x) => x.anio)).toEqual(['2024', '1993']);
    expect(g[0]!.sets.map((s) => s.id)).toEqual([3, 2]);
  });

  it('un set sin fecha va al final, en su propio grupo', () => {
    const g = agruparPorAnio([set(1, null), set(2, '2010-01-01')]);
    expect(g.map((x) => x.anio)).toEqual(['2010', null]);
  });
});
