import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { quitarSentenciasDeBase } from './migration-sql.js';

describe('quitarSentenciasDeBase (T-065)', () => {
  it('quita el USE que la 0001 lleva dentro', () => {
    const r = quitarSentenciasDeBase('USE proyecto_tcg;\nCREATE TABLE t (id INT);\n');
    expect(r.quitadas).toEqual(['USE proyecto_tcg;']);
    expect(r.sql).not.toContain('USE proyecto_tcg');
    expect(r.sql).toContain('CREATE TABLE t');
  });

  it('quita tambien el CREATE DATABASE, aunque ocupe varias lineas', () => {
    const sql = [
      'CREATE DATABASE IF NOT EXISTS proyecto_tcg',
      '  CHARACTER SET utf8mb4',
      '  COLLATE utf8mb4_0900_ai_ci;',
      '',
      'CREATE TABLE t (id INT);',
    ].join('\n');
    const r = quitarSentenciasDeBase(sql);
    expect(r.quitadas).toHaveLength(1);
    expect(r.quitadas[0]).toContain('CREATE DATABASE');
    expect(r.sql).not.toContain('CREATE DATABASE');
    expect(r.sql).toContain('CREATE TABLE t');
  });

  it('acepta comillas invertidas en el nombre', () => {
    expect(quitarSentenciasDeBase('USE `otra_base`;\n').quitadas).toEqual(['USE `otra_base`;']);
  });

  it('NO toca un USE que este dentro de un comentario', () => {
    // Las cabeceras de las migraciones de este proyecto hablan de `USE` a
    // menudo. Quitar una linea de comentario no rompe nada, pero contarla como
    // sentencia quitada mentiria en el informe.
    const sql = '-- NO LLEVA `USE`: ver la cabecera de la 0007 (P-032).\nCREATE TABLE t (id INT);\n';
    const r = quitarSentenciasDeBase(sql);
    expect(r.quitadas).toEqual([]);
    expect(r.sql).toBe(sql);
  });

  it('NO toca un USE que aparezca dentro de una cadena', () => {
    const sql = "INSERT INTO t (s) VALUES ('USE proyecto_tcg;');\n";
    expect(quitarSentenciasDeBase(sql).quitadas).toEqual([]);
  });

  it('deja intacto un fichero que no elige base', () => {
    const sql = 'ALTER TABLE sets ADD COLUMN x INT NULL;\n';
    const r = quitarSentenciasDeBase(sql);
    expect(r.quitadas).toEqual([]);
    expect(r.sql).toBe(sql);
  });
});

describe('las migraciones publicadas, tal como estan en disco', () => {
  const leer = (n: string) =>
    readFileSync(fileURLToPath(new URL(`../../../../db/migrations/${n}`, import.meta.url)), 'utf8');

  it('la 0001 sigue fijando la base, y el migrador se lo quita', () => {
    // Es el nucleo de P-032. La 0001 no se puede editar -- esta publicada -- asi
    // que la garantia tiene que estar en el migrador. Si alguien "arreglara" la
    // 0001 algun dia, este test lo diria en vez de dejar la proteccion sin caso.
    const cruda = leer('0001_initial_schema.up.sql');
    expect(cruda).toContain('USE proyecto_tcg;');
    expect(cruda).toContain('CREATE DATABASE');

    const r = quitarSentenciasDeBase(cruda);
    expect(r.quitadas).toHaveLength(2);
    expect(r.sql).not.toMatch(/^\s*USE\s/m);
    expect(r.sql).not.toMatch(/CREATE DATABASE/);
    // Y lo que importa sigue estando.
    expect(r.sql).toContain('CREATE TABLE games');
    expect(r.sql).toContain('CREATE TABLE card_prints');
  });

  it('las migraciones nuevas ya no fijan la base', () => {
    // Desde la 0007 se escriben sin `USE` a proposito. Que siga siendo asi.
    for (const n of [
      '0007_image_failures.up.sql',
      '0008_set_icons.up.sql',
      '0009_template_eras.up.sql',
      '0010_ygo_era_templates.up.sql',
      '0011_ygo_modern_gaps.up.sql',
      '0012_ptcg_era_templates.up.sql',
      '0013_set_is_openable.up.sql',
    ]) {
      expect(quitarSentenciasDeBase(leer(n)).quitadas, `${n} elige base`).toEqual([]);
    }
  });
});
