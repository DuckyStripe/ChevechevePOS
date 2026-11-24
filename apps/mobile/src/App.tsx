import * as Application from 'expo-application';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import WebViewBase from 'react-native-webview';
import type { AndroidWebViewProps, ShouldStartLoadRequest, WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
import { ProveedorActualizaciones, useActualizaciones } from './actualizaciones/proveedor';
import { ORIGEN_PANEL } from './config';
import { decidirNavegacion } from './navegacion';
import { pedirTokenPush, prepararNotificaciones, rutaDelAviso } from './push';
import { guionParaPagina, interpretar, type MensajeSaliente } from './puente';
import { MalConfigurada, SinConexion } from './sin-conexion';

const ETIQUETA_RUTA = 'ruta';

/** Lo único del WebView que se usa por referencia. */
interface ManejadorWebView {
  injectJavaScript: (guion: string) => void;
  goBack: () => void;
  reload: () => void;
}

// Los tipos de react-native-webview 14 unen las props de iOS, Android y Windows (TS7024) y no declaran `ref`: se tipa solo Android.
const WebView = WebViewBase as unknown as ComponentType<AndroidWebViewProps & { ref?: Ref<ManejadorWebView> }>;

prepararNotificaciones();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {ORIGEN_PANEL === null ? (
        <MalConfigurada />
      ) : (
        <ProveedorActualizaciones origen={ORIGEN_PANEL}>
          <Panel origen={ORIGEN_PANEL} />
        </ProveedorActualizaciones>
      )}
    </SafeAreaProvider>
  );
}

function Panel({ origen }: { origen: string }) {
  const insets = useSafeAreaInsets();
  const { estado, buscar, fijarSinGuardar } = useActualizaciones();
  const web = useRef<ManejadorWebView>(null);
  const puedeIrAtras = useRef(false);
  const cargada = useRef(false);
  const [sinConexion, setSinConexion] = useState(false);
  // Con la app cerrada, el toque del aviso la abre en su pantalla; el listener de abajo cubre abierta y en segundo plano.
  const [urlInicial] = useState(() => {
    const ultimo = Notifications.getLastNotificationResponse();
    // Se consume: si una OTA reinicia la app, no debe reabrir la ruta de un aviso viejo.
    Notifications.clearLastNotificationResponse();
    return `${origen}${ultimo ? rutaDelAviso(ultimo) : '/'}`;
  });

  const enviar = useCallback((mensaje: MensajeSaliente) => {
    web.current?.injectJavaScript(guionParaPagina(mensaje));
  }, []);

  useEffect(() => {
    const suscripcion = Notifications.addNotificationResponseReceivedListener((respuesta) => {
      web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(`${origen}${rutaDelAviso(respuesta)}`)});true;`);
    });
    return () => {
      suscripcion.remove();
    };
  }, [origen]);

  useEffect(() => {
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!puedeIrAtras.current) return false;
      web.current?.goBack();
      return true;
    });
    return () => {
      suscripcion.remove();
    };
  }, []);

  // El estado de la app llega a la página cuando cambia (la página ya cargada) y al terminar de cargar.
  useEffect(() => {
    if (cargada.current) enviar(estado);
  }, [estado, enviar]);

  useEffect(
    () => () => {
      void deactivateKeepAwake(ETIQUETA_RUTA);
    },
    [],
  );

  const alMensaje = useCallback(
    (evento: WebViewMessageEvent) => {
      const mensaje = interpretar(evento.nativeEvent.data, evento.nativeEvent.url, origen);
      if (!mensaje) return;
      switch (mensaje.tipo) {
        case 'pedir_push':
          void pedirTokenPush().then((r) => {
            enviar({ tipo: 'push_token', token: 'token' in r ? r.token : null, ...('motivo' in r ? { motivo: r.motivo } : {}), plataforma: 'android', version: Application.nativeApplicationVersion ?? '0' });
          });
          break;
        case 'pantalla_encendida':
          if (mensaje.activa) void activateKeepAwakeAsync(ETIQUETA_RUTA);
          else void deactivateKeepAwake(ETIQUETA_RUTA);
          break;
        case 'sin_guardar':
          fijarSinGuardar(mensaje.activo);
          break;
        case 'buscar_actualizacion':
          void buscar();
          break;
      }
    },
    [origen, enviar, buscar, fijarSinGuardar],
  );

  const alPedirCarga = useCallback(
    (peticion: ShouldStartLoadRequest) => {
      const decision = decidirNavegacion(peticion.url, origen);
      if (decision === 'fuera') void Linking.openURL(peticion.url).catch(() => undefined);
      return decision === 'dentro';
    },
    [origen],
  );

  return (
    <View style={[estilos.raiz, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={web}
        style={sinConexion ? estilos.oculto : estilos.web}
        source={{ uri: urlInicial }}
        // '*' + decisión propia: con una lista, react-native-webview abriría solo los demás enlaces con Linking.
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={alPedirCarga}
        onMessage={alMensaje}
        onNavigationStateChange={(n) => {
          puedeIrAtras.current = n.canGoBack;
        }}
        onLoadStart={() => {
          // Documento nuevo: lo sin guardar y la pantalla encendida de la página anterior ya no existen.
          fijarSinGuardar(false);
          void deactivateKeepAwake(ETIQUETA_RUTA);
        }}
        onLoadEnd={() => {
          cargada.current = true;
          enviar(estado);
        }}
        onLoad={() => {
          setSinConexion(false);
        }}
        onError={() => {
          setSinConexion(true);
        }}
        applicationNameForUserAgent={`ChevecheveApp/${Application.nativeApplicationVersion ?? '0'}`}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled={false}
        geolocationEnabled
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        webviewDebuggingEnabled={__DEV__}
      />
      {sinConexion ? (
        <View style={estilos.sobre}>
          <SinConexion
            onReintentar={() => {
              setSinConexion(false);
              web.current?.reload();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1 },
  oculto: { flex: 1, opacity: 0 },
  sobre: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
