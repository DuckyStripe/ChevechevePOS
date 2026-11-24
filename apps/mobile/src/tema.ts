import { useColorScheme } from 'react-native';

/** Tokens «Caguama» (iguales a la web). El cascarón sigue el modo claro/oscuro del sistema. */
const claro = { fondo: '#eff0ec', superficie: '#ffffff', hundido: '#e6e8e2', texto: '#1a1d1b', suave: '#575c58', borde: '#d8dbd4', marca: '#a3470f', marcaPresionada: '#863a0c', textoMarca: '#8a3b0b', marcaSuave: '#fbebdc', peligro: '#b42318', exito: '#17734a' };
const oscuro = { ...claro, fondo: '#121413', superficie: '#1b1e1c', hundido: '#262a27', texto: '#eeeee9', suave: '#a9ada8', borde: '#2e322f', marca: '#b5541a', textoMarca: '#f4ae6e', marcaSuave: '#36261a', peligro: '#ff968a', exito: '#62d29e' };

export type Tema = typeof claro;

export const RADIO_CONTROL = 12;
export const RADIO_TARJETA = 16;

export function useTema(): Tema {
  return useColorScheme() === 'dark' ? oscuro : claro;
}
