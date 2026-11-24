import { describe, expect, it } from 'vitest';
import { decidirNavegacion, origenDelPanel, rutaDeDatos, rutaSegura } from './navegacion';

const O = 'https://panel.ejemplo.mx';

describe('rutaSegura', () => {
  it('acepta rutas internas con query simple', () => {
    expect(rutaSegura('/reparto')).toBe('/reparto');
    expect(rutaSegura('/pedidos/12_a?x=1&y=2')).toBe('/pedidos/12_a?x=1&y=2');
    expect(rutaSegura('/')).toBe('/');
  });
  it('lo demás abre /', () => {
    for (const mala of ['https://evil.com', '//evil.com', 'reparto', '/A', '/a b', '/a#x', '/a?x=<', undefined, 5, null]) {
      expect(rutaSegura(mala)).toBe('/');
    }
  });
});

describe('rutaDeDatos', () => {
  it('lee datos como JSON en texto (FCM), como objeto o ruta suelta', () => {
    expect(rutaDeDatos({ datos: '{"ruta":"/reparto"}' })).toBe('/reparto');
    expect(rutaDeDatos({ datos: { ruta: '/pos' } })).toBe('/pos');
    expect(rutaDeDatos({ ruta: '/cobrar?x=1' })).toBe('/cobrar?x=1');
  });
  it('lo roto o peligroso abre /', () => {
    for (const d of [undefined, null, 'x', {}, { datos: 'no json' }, { datos: '{"ruta":"https://evil.com"}' }, { datos: '{"ruta":"//evil.com"}' }, { datos: '5' }, { datos: '{"ruta":5}' }]) {
      expect(rutaDeDatos(d)).toBe('/');
    }
  });
});

describe('origenDelPanel', () => {
  it('https siempre, http solo en desarrollo', () => {
    expect(origenDelPanel('https://Panel.Ejemplo.mx/', false)).toBe(O);
    expect(origenDelPanel('http://192.168.1.5:3000', false)).toBeNull();
    expect(origenDelPanel('http://192.168.1.5:3000', true)).toBe('http://192.168.1.5:3000');
    expect(origenDelPanel(undefined, true)).toBeNull();
    expect(origenDelPanel('https://panel.mx/ruta', false)).toBeNull();
  });
});

describe('decidirNavegacion', () => {
  it('mismo origen entra', () => {
    expect(decidirNavegacion(`${O}/reparto?x=1`, O)).toBe('dentro');
    expect(decidirNavegacion('about:blank', O)).toBe('dentro');
  });
  it('apps externas salen', () => {
    for (const u of [
      'https://wa.me/5215512345678?text=hola',
      'whatsapp://send?phone=1',
      'tel:+525512345678',
      'https://www.google.com/maps/search/?api=1&query=1,2',
      'https://maps.app.goo.gl/abc',
      'https://waze.com/ul?ll=1,2',
      'https://www.waze.com/ul?ll=1,2',
    ]) {
      expect(decidirNavegacion(u, O)).toBe('fuera');
    }
  });
  it('lo demás se bloquea', () => {
    for (const u of [
      'https://evil.com/',
      'http://panel.ejemplo.mx/',
      'https://panel.ejemplo.mx@evil.com/',
      'https://panel.ejemplo.mx.evil.com/',
      'https://www.google.com/search?q=maps',
      'http://wa.me/1',
      'javascript:alert(1)',
      'intent://x#Intent;end',
      'file:///etc/passwd',
      'data:text/html,hola',
      'basura',
    ]) {
      expect(decidirNavegacion(u, O)).toBe('bloquear');
    }
  });
});
