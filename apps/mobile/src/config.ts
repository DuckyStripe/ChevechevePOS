import { origenDelPanel } from './navegacion';

/** Origen del panel (`EXPO_PUBLIC_URL_PANEL`, se incrusta al compilar). `null` = mal configurado: la app lo dice y no carga nada. */
export const ORIGEN_PANEL: string | null = origenDelPanel(process.env.EXPO_PUBLIC_URL_PANEL as string | undefined, __DEV__);
