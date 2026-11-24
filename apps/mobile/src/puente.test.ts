import { describe, expect, it } from 'vitest';
import { guionParaPagina, interpretar } from './puente';

const O = 'https://panel.ejemplo.mx';
const P = `${O}/reparto`;

describe('interpretar', () => {
  it('acepta los 4 mensajes de la página', () => {
    expect(interpretar('{"tipo":"pedir_push"}', P, O)).toEqual({ tipo: 'pedir_push' });
    expect(interpretar('{"tipo":"buscar_actualizacion"}', P, O)).toEqual({ tipo: 'buscar_actualizacion' });
    expect(interpretar('{"tipo":"pantalla_encendida","activa":true}', P, O)).toEqual({ tipo: 'pantalla_encendida', activa: true });
    expect(interpretar('{"tipo":"sin_guardar","datos":{"activo":false}}', P, O)).toEqual({ tipo: 'sin_guardar', activo: false });
  });
  it('ignora páginas de otro origen', () => {
    expect(interpretar('{"tipo":"pedir_push"}', 'https://evil.com/', O)).toBeNull();
    expect(interpretar('{"tipo":"pedir_push"}', 'about:blank', O)).toBeNull();
    expect(interpretar('{"tipo":"pedir_push"}', 'https://panel.ejemplo.mx@evil.com/', O)).toBeNull();
  });
  it('ignora tipo desconocido, datos faltantes o basura', () => {
    expect(interpretar('{"tipo":"nuevo_futuro"}', P, O)).toBeNull();
    expect(interpretar('{"tipo":"sin_guardar","activo":"si"}', P, O)).toBeNull();
    expect(interpretar('{"tipo":"pantalla_encendida"}', P, O)).toBeNull();
    expect(interpretar('no es json', P, O)).toBeNull();
    expect(interpretar('null', P, O)).toBeNull();
    expect(interpretar(`{"tipo":"pedir_push","x":"${'a'.repeat(3000)}"}`, P, O)).toBeNull();
  });
});

describe('guionParaPagina', () => {
  it('entrega el JSON como texto y escapa comillas', () => {
    const guion = guionParaPagina({ tipo: 'push_token', token: 'a"b', plataforma: 'android', version: '0.1.0' });
    const m = /data:(".*")\}\)\);true;$/.exec(guion);
    expect(m).not.toBeNull();
    const texto = JSON.parse(m?.[1] ?? '""') as string;
    expect(JSON.parse(texto)).toEqual({ tipo: 'push_token', token: 'a"b', plataforma: 'android', version: '0.1.0' });
  });
});
