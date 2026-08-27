import { describe, it, expect } from 'vitest';
import {
  normalizeRarityCode,
  normalizeOracleKeyFromName,
  toJsonNumber,
  toStringArray,
  stripUndefined,
  RARITY_CODE_MAX_LENGTH,
} from './normalize.js';

/**
 * Los casos de aqui NO son inventados: salen de respuestas reales de las tres
 * APIs muestreadas el 2026-08-25. Ver 005Registro/2026-08-25_S003_Seeds.md.
 */

describe('normalizeRarityCode', () => {
  it('mapea el vocabulario real de Pokemon TCG (endpoint /v2/rarities)', () => {
    // Las 38 rarezas de la API tienen formatos caprichosos; estas son las duras.
    expect(normalizeRarityCode('Rare Holo LV.X')).toBe('rare_holo_lv_x');
    expect(normalizeRarityCode('MEGA_ATTACK_RARE')).toBe('mega_attack_rare');
    expect(normalizeRarityCode('LEGEND')).toBe('legend');
    expect(normalizeRarityCode('ACE SPEC Rare')).toBe('ace_spec_rare');
    expect(normalizeRarityCode('Special Illustration Rare')).toBe('special_illustration_rare');
  });

  it('mapea el vocabulario de Scryfall', () => {
    expect(normalizeRarityCode('common')).toBe('common');
    expect(normalizeRarityCode('mythic')).toBe('mythic');
    expect(normalizeRarityCode('bonus')).toBe('bonus');
  });

  it('RECUPERA la errata real de YGOPRODeck (P-007)', () => {
    // El origen devuelve "PLatinum Secret Rare", con L intercalada. Un mapeo por
    // igualdad exacta habria creado una rareza fantasma distinta de la buena.
    expect(normalizeRarityCode('PLatinum Secret Rare')).toBe('platinum_secret_rare');
    expect(normalizeRarityCode('Platinum Secret Rare')).toBe('platinum_secret_rare');
    // Las dos formas convergen: eso es justo lo que evita el duplicado.
    expect(normalizeRarityCode('PLatinum Secret Rare')).toBe(
      normalizeRarityCode('Platinum Secret Rare'),
    );
  });

  it('DESCARTA la basura real de YGOPRODeck (P-007)', () => {
    // El mismo set devolvio los literales "2" y "3" como rareza.
    expect(normalizeRarityCode('2')).toBeNull();
    expect(normalizeRarityCode('3')).toBeNull();
    expect(normalizeRarityCode('')).toBeNull();
    expect(normalizeRarityCode('   ')).toBeNull();
    expect(normalizeRarityCode(null)).toBeNull();
    expect(normalizeRarityCode(undefined)).toBeNull();
  });

  it('elimina apostrofos y acentos', () => {
    expect(normalizeRarityCode("Collector's Rare")).toBe('collectors_rare');
    // Apostrofo tipografico U+2019, que es lo que suelen devolver las APIs.
    expect(normalizeRarityCode('Collector’s Rare')).toBe('collectors_rare');
    expect(normalizeRarityCode('Rareza Pokémon')).toBe('rareza_pokemon');
  });

  it('respeta el limite de VARCHAR(48) del DDL (P-009)', () => {
    const largo = 'duel_terminal_normal_parallel_rare';
    expect(largo.length).toBe(34);
    expect(largo.length).toBeLessThanOrEqual(RARITY_CODE_MAX_LENGTH);
    expect(normalizeRarityCode('Duel Terminal Normal Parallel Rare')).toBe(largo);

    // Por encima de 48 devuelve null en vez de truncar: truncar en silencio
    // podria colisionar dos rarezas distintas en el mismo code.
    expect(normalizeRarityCode('x'.repeat(RARITY_CODE_MAX_LENGTH + 1))).toBeNull();
  });

  it('es idempotente: normalizar un code ya normalizado no lo cambia', () => {
    for (const raw of ['Ultra Rare', "Collector's Rare", 'Rare Holo LV.X']) {
      const once = normalizeRarityCode(raw)!;
      expect(normalizeRarityCode(once)).toBe(once);
    }
  });
});

describe('toJsonNumber', () => {
  it('acepta numeros y cadenas numericas', () => {
    expect(toJsonNumber(3000)).toBe(3000);
    expect(toJsonNumber('3000')).toBe(3000);
    expect(toJsonNumber('2500')).toBe(2500);
    expect(toJsonNumber(0)).toBe(0);
    expect(toJsonNumber('-1')).toBe(-1);
    expect(toJsonNumber(1.5)).toBe(1.5); // cmc de MTG puede ser fraccionario
  });

  it('OMITE el ATK variable de Yu-Gi-Oh! (el caso que tumbaba la ingesta)', () => {
    // Slifer the Sky Dragon llega como {"atk":"?","def":"?"}. Persistir ese "?"
    // hace que la columna generada intente un CAST que aborta el INSERT.
    expect(toJsonNumber('?')).toBeUndefined();
    expect(toJsonNumber('X')).toBeUndefined();
    expect(toJsonNumber('')).toBeUndefined();
    expect(toJsonNumber(null)).toBeUndefined();
    expect(toJsonNumber(undefined)).toBeUndefined();
    expect(toJsonNumber(NaN)).toBeUndefined();
    expect(toJsonNumber(Infinity)).toBeUndefined();
    expect(toJsonNumber({})).toBeUndefined();
  });

  it('rechaza cadenas mixtas en vez de parsearlas a medias', () => {
    // Number.parseInt('3000?') daria 3000. Aqui no: si no es limpiamente
    // numerico, se omite. Preferimos un NULL honesto a un dato inventado.
    expect(toJsonNumber('3000?')).toBeUndefined();
    expect(toJsonNumber('1 2 3')).toBeUndefined();
  });
});

describe('toStringArray', () => {
  it('preserva el array de colores de MTG (contrato del indice multivaluado)', () => {
    expect(toStringArray(['R'])).toEqual(['R']);
    expect(toStringArray(['B', 'G'])).toEqual(['B', 'G']);
  });

  it('omite escalares y vacios, que romperian el indice multivaluado', () => {
    expect(toStringArray('R')).toBeUndefined();
    expect(toStringArray([])).toBeUndefined();
    expect(toStringArray(null)).toBeUndefined();
    expect(toStringArray(undefined)).toBeUndefined();
    expect(toStringArray([''])).toBeUndefined();
  });

  it('filtra elementos no-cadena de arrays mixtos', () => {
    expect(toStringArray(['W', 2, null, 'U'])).toEqual(['W', 'U']);
  });
});

describe('stripUndefined', () => {
  it('deja fuera las claves undefined pero conserva null, 0 y cadena vacia', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: null, d: 0, e: '' })).toEqual({
      a: 1,
      c: null,
      d: 0,
      e: '',
    });
  });

  it('produce un game_data limpio a partir de una carta YGO con ATK variable', () => {
    const gameData = stripUndefined({
      attribute: 'DIVINE',
      race: 'Divine-Beast',
      level: toJsonNumber(10),
      atk: toJsonNumber('?'),
      def: toJsonNumber('?'),
    });
    expect(gameData).toEqual({ attribute: 'DIVINE', race: 'Divine-Beast', level: 10 });
    expect('atk' in gameData).toBe(false);
  });
});

describe('normalizeOracleKeyFromName', () => {
  it('construye la identidad conceptual de Pokemon desde el nombre', () => {
    expect(normalizeOracleKeyFromName('Charizard')).toBe('charizard');
    expect(normalizeOracleKeyFromName('Mr. Mime')).toBe('mr-mime');
    expect(normalizeOracleKeyFromName("Farfetch'd")).toBe('farfetchd');
    expect(normalizeOracleKeyFromName('Flabébé')).toBe('flabebe');
  });

  it('NO fusiona Nidoran macho y hembra (bug detectado al escribir este test)', () => {
    // Son dos Pokemon distintos con el mismo nombre base. La primera version de
    // normalizeOracleKeyFromName borraba los simbolos de genero y ambos caian en
    // 'nidoran': la ingesta habria fusionado dos cartas en una y perdido una.
    const macho = String.fromCharCode(0x2642);
    const hembra = String.fromCharCode(0x2640);

    expect(normalizeOracleKeyFromName(`Nidoran${macho}`)).toBe('nidoran-m');
    expect(normalizeOracleKeyFromName(`Nidoran${hembra}`)).toBe('nidoran-f');
    expect(normalizeOracleKeyFromName(`Nidoran${macho}`)).not.toBe(
      normalizeOracleKeyFromName(`Nidoran${hembra}`),
    );
  });
});

describe('etiquetas que no son rarezas (T-081)', () => {
  it('rechaza el estado de la carta disfrazado de rareza', () => {
    // YGOPRODeck usa `set_rarity` para dos cosas. "New" no dice que la carta sea
    // comun: dice que no es una reimpresion. Dejarlas pasar creaba rarezas
    // fantasma que ninguna plantilla podia -- ni debia -- nombrar.
    for (const bruto of ['New', 'Reprint', 'New Artwork', 'European Debut',
                         'Oceanian Debut', 'European/Oceanian Debut', 'Force SMW']) {
      expect(normalizeRarityCode(bruto), bruto).toBeNull();
    }
  });

  it('NO se lleva por delante rarezas que se le parecen', () => {
    // El filtro es por igualdad exacta, no por contener la palabra: una rareza
    // que empiece por "new" o acabe en "debut" seguiria siendo valida.
    expect(normalizeRarityCode('New Secret Rare')).toBe('new_secret_rare');
    expect(normalizeRarityCode('Debut Rare')).toBe('debut_rare');
  });

  it('traduce las abreviaturas a la rareza que nombran', () => {
    // `cr` sale una vez en Quarter Century Stampede, un set que ADEMAS tiene
    // collectors_rare: es la misma rareza escrita corta.
    expect(normalizeRarityCode('CR')).toBe('collectors_rare');
    expect(normalizeRarityCode("Collector's Rare")).toBe('collectors_rare');
  });
});
