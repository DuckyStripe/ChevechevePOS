import { describe, expect, it } from 'vitest';
import appJson from '../../app.json';
import { NOVEDADES } from './novedades';

describe('novedades por versión', () => {
  it('la primera entrada es la versión de app.json', () => {
    expect(NOVEDADES[0]?.version).toBe(appJson.expo.version);
  });

  it('cada entrada tiene fecha AAAA-MM-DD y novedades con texto', () => {
    expect(NOVEDADES.length).toBeGreaterThan(0);
    for (const n of NOVEDADES) {
      expect(n.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(n.items.length).toBeGreaterThan(0);
      expect(n.items.every((i) => i.trim().length > 0)).toBe(true);
    }
  });

  it('van de la más nueva a la más vieja', () => {
    const fechas = NOVEDADES.map((n) => n.fecha);
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });
});
