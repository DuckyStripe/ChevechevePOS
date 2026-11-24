import * as Notifications from 'expo-notifications';
import { rutaDeDatos } from './navegacion';

/** Canal de Android de los avisos; el servidor manda `channel_id: "avisos"`. */
export const CANAL_AVISOS = 'avisos';

let preparado = false;

/** Una vez al arrancar: cómo se muestra un aviso con la app abierta y el canal «Avisos». */
export function prepararNotificaciones(): void {
  if (preparado) return;
  preparado = true;
  Notifications.setNotificationHandler({
    // eslint-disable-next-line @typescript-eslint/require-await -- la firma del manejador es asíncrona
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  void Notifications.setNotificationChannelAsync(CANAL_AVISOS, {
    name: 'Avisos',
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => undefined);
}

export type ResultadoPush = { token: string } | { motivo: 'sin_permiso' | 'error' };

/**
 * Pide el permiso (Android 13+) y el token FCM del aparato. NUNCA el token de Expo: el servidor manda directo por FCM.
 * El token solo vuelve a la página por el puente; no se guarda ni se loguea.
 */
export async function pedirTokenPush(): Promise<ResultadoPush> {
  try {
    let permiso = await Notifications.getPermissionsAsync();
    if (!permiso.granted && permiso.canAskAgain) permiso = await Notifications.requestPermissionsAsync();
    if (!permiso.granted) return { motivo: 'sin_permiso' };
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === 'string' && token.data !== '' ? { token: token.data } : { motivo: 'error' };
  } catch {
    return { motivo: 'error' };
  }
}

/** Ruta de la pantalla a abrir al tocar un aviso (`datos.ruta`); cualquier cosa rara abre `/`. */
export function rutaDelAviso(respuesta: Notifications.NotificationResponse): string {
  return rutaDeDatos(respuesta.notification.request.content.data);
}
