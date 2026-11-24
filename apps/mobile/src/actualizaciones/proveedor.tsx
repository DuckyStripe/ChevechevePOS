import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { MensajeSaliente } from '../puente';
import { abrirInstalador, descargarApk, ErrorInstalacion, verificarApk } from './apk';
import { AvisoActualizacionLista, AvisoVersionNueva, PantallaActualiza } from './aviso';
import {
  apkMasNueva,
  bloqueadaPorObligatoria,
  codigoInstalado,
  debeRevisar,
  decidirAplicar,
  leerApk,
  porcentaje,
  resultadoDe,
  RUTA_APK,
  urlDeApk,
  type ApkUltima,
} from './logica';
import { NOVEDADES } from './novedades';
import { posponerVersion, versionPospuesta } from './pospuestas';

type EstadoApp = Extract<MensajeSaliente, { tipo: 'estado_app' }>;

export interface ApiActualizaciones {
  /** Lo que `/notificaciones` › «Esta app» muestra. Cambia de identidad cuando cambia algo. */
  estado: EstadoApp;
  /** «Buscar actualización» (mensaje `buscar_actualizacion`): revisa OTA y APK ahora. */
  buscar: () => Promise<void>;
  /** Mensaje `sin_guardar`: mientras sea true el cascarón NO se reinicia para actualizarse. */
  fijarSinGuardar: (activo: boolean) => void;
}

const Contexto = createContext<ApiActualizaciones | null>(null);

export function useActualizaciones(): ApiActualizaciones {
  const api = useContext(Contexto);
  if (!api) throw new Error('Falta ProveedorActualizaciones');
  return api;
}

const MENSAJES = {
  descarga: 'No se pudo descargar la versión nueva. Intenta de nuevo con mejor conexión.',
  corrupta: 'El archivo descargado no coincide con el publicado. No se instaló nada; intenta de nuevo.',
  instalador: 'No se pudo abrir el instalador. Intenta de nuevo o pide ayuda a la oficina.',
} as const;

/** GET público de la última APK. Lanza si no hay red o el servidor falla (el llamador nunca bloquea por eso). */
async function pedirApk(origen: string): Promise<ApkUltima | null> {
  const control = new AbortController();
  const reloj = setTimeout(() => {
    control.abort();
  }, 10_000);
  try {
    const r = await fetch(`${origen}${RUTA_APK}`, { signal: control.signal, headers: { accept: 'application/json' }, credentials: 'omit' });
    if (!r.ok) throw new Error('servidor');
    return leerApk(await r.json());
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Dueño del flujo de actualización (CONTRATOS §4.6.1): OTA de `expo-updates` (se baja sola; aquí se decide cuándo
 * reiniciar y se revisa a mano) y APK nueva (aviso, bloqueo obligatorio, descarga con sha256). Va fuera del panel:
 * la revisión es pública y nunca retiene el login.
 */
export function ProveedorActualizaciones({ origen, children }: { origen: string; children: ReactNode }) {
  const { currentlyRunning, isUpdatePending } = Updates.useUpdates();
  const instalado = codigoInstalado(Application.nativeBuildVersion);
  const [ultima, setUltima] = useState<ApkUltima | null>(null);
  const [revisionFallo, setRevisionFallo] = useState(false);
  const [aviso, setAviso] = useState<ApkUltima | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisoLista, setAvisoLista] = useState(false);
  const sinGuardar = useRef(false);
  const pendiente = useRef(isUpdatePending);
  const ultimaRevision = useRef<number | null>(null);
  const trabajando = useRef(false);
  const [abiertaEn] = useState(() => Date.now());

  useEffect(() => {
    pendiente.current = isUpdatePending;
  }, [isUpdatePending]);

  const fijarSinGuardar = useCallback((activo: boolean) => {
    sinGuardar.current = activo;
  }, []);

  const bloqueada = bloqueadaPorObligatoria(ultima, instalado) ? ultima : null;

  /** Trae la APK más nueva. Solo una respuesta real cambia el bloqueo: si falla, lanza antes de tocarlo. */
  const revisarApk = useCallback(async (): Promise<ApkUltima | null> => {
    const apk = await pedirApk(origen);
    setUltima(apk);
    return apk && apkMasNueva(apk.versionCode, instalado) ? apk : null;
  }, [origen, instalado]);

  const reiniciar = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // Si no puede reiniciar, la OTA queda para el próximo arranque.
    }
  }, []);

  const decidir = useCallback(
    (alAbrir: boolean, ausenteMs: number | null) => {
      const d = decidirAplicar({ pendiente: pendiente.current, sinGuardar: sinGuardar.current, alAbrir, ausenteMs });
      if (d === 'aplicar') void reiniciar();
      else if (d === 'aviso') setAvisoLista(true);
    },
    [reiniciar],
  );

  /** Busca y baja una OTA (como mucho cada 30 min). Los fallos callan: sin red o sin servidor no es noticia. */
  const revisarOta = useCallback(async () => {
    const ahora = Date.now();
    if (!Updates.isEnabled || trabajando.current || !debeRevisar(ultimaRevision.current, ahora)) return;
    ultimaRevision.current = ahora;
    try {
      if ((await Updates.checkForUpdateAsync()).isAvailable) await Updates.fetchUpdateAsync();
    } catch {
      // Sin red o sin servidor.
    }
  }, []);

  // Al abrir: OTA en segundo plano y aviso de APK (una vez, después del primer dibujo; no retiene el panel).
  const arranque = useRef(false);
  useEffect(() => {
    if (arranque.current) return;
    arranque.current = true;
    void revisarOta();
    void (async () => {
      try {
        const apk = await revisarApk();
        if (apk && !apk.obligatoria && !(await versionPospuesta(apk.versionCode, Date.now()))) setAviso(apk);
      } catch {
        setRevisionFallo(true);
      }
    })();
  }, [revisarOta, revisarApk]);

  // OTA bajada justo después de abrir: se aplica ya (salvo trabajo sin guardar).
  useEffect(() => {
    if (isUpdatePending && Date.now() - abiertaEn < 2 * 60 * 1000) decidir(true, null);
  }, [isUpdatePending, decidir, abiertaEn]);

  // Al volver al frente: aplica tras ≥ 5 min fuera y vuelve a revisar.
  useEffect(() => {
    let salioEn: number | null = null;
    const suscripcion = AppState.addEventListener('change', (siguiente) => {
      if (siguiente === 'background') salioEn ??= Date.now();
      if (siguiente !== 'active') return;
      const ausente = salioEn === null ? null : Date.now() - salioEn;
      salioEn = null;
      decidir(false, ausente);
      void revisarOta();
      revisarApk().then(
        () => {
          setRevisionFallo(false);
        },
        () => {
          setRevisionFallo(true);
        },
      );
    });
    return () => {
      suscripcion.remove();
    };
  }, [decidir, revisarOta, revisarApk]);

  const buscar = useCallback(async () => {
    if (trabajando.current) return;
    trabajando.current = true;
    let fallo = false;
    try {
      if (Updates.isEnabled) {
        try {
          if ((await Updates.checkForUpdateAsync()).isAvailable) {
            await Updates.fetchUpdateAsync();
            pendiente.current = true;
          }
        } catch {
          fallo = true;
        }
      }
      try {
        const apk = await revisarApk();
        if (apk && !apk.obligatoria) setAviso(apk);
      } catch {
        fallo = true;
      }
      setRevisionFallo(fallo);
    } finally {
      trabajando.current = false;
    }
    decidir(true, null);
  }, [revisarApk, decidir]);

  const instalar = useCallback(async () => {
    const apk = bloqueada ?? aviso;
    const url = apk ? urlDeApk(origen, apk) : null;
    if (!apk || !url || trabajando.current) return;
    trabajando.current = true;
    setError(null);
    try {
      setOcupado('Descargando… 0%');
      const archivo = await descargarApk(url, apk, (hecho, total) => {
        setOcupado(`Descargando… ${String(porcentaje(hecho, total))}%`);
      });
      setOcupado('Verificando…');
      await verificarApk(archivo, apk);
      await abrirInstalador(archivo);
    } catch (e) {
      setError(MENSAJES[e instanceof ErrorInstalacion ? e.motivo : 'descarga']);
    } finally {
      setOcupado(null);
      trabajando.current = false;
    }
  }, [bloqueada, aviso, origen]);

  const masTarde = useCallback(() => {
    if (aviso) void posponerVersion(aviso.versionCode, Date.now());
    setAviso(null);
    setError(null);
  }, [aviso]);

  const estado = useMemo<EstadoApp>(() => {
    const propia = !currentlyRunning.isEmbeddedLaunch;
    return {
      tipo: 'estado_app',
      version: Application.nativeApplicationVersion ?? '0',
      version_code: instalado,
      ota_id: propia ? (currentlyRunning.updateId ?? null) : null,
      ota_fecha: propia ? (currentlyRunning.createdAt?.toISOString() ?? null) : null,
      resultado: resultadoDe({ revisionFallo, apkNueva: ultima !== null && apkMasNueva(ultima.versionCode, instalado), otaLista: isUpdatePending }),
      novedades: NOVEDADES,
    };
  }, [currentlyRunning, instalado, revisionFallo, ultima, isUpdatePending]);

  const valor = useMemo<ApiActualizaciones>(() => ({ estado, buscar, fijarSinGuardar }), [estado, buscar, fijarSinGuardar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <PantallaActualiza apk={bloqueada} ocupado={ocupado} error={error} onInstalar={() => void instalar()} />
      <AvisoVersionNueva apk={bloqueada ? null : aviso} ocupado={ocupado} error={error} onInstalar={() => void instalar()} onMasTarde={masTarde} />
      {isUpdatePending && avisoLista ? (
        <AvisoActualizacionLista
          onReiniciar={() => void reiniciar()}
          onDespues={() => {
            setAvisoLista(false);
          }}
        />
      ) : null}
    </Contexto.Provider>
  );
}
