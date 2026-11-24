import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { tamanoTexto, type ApkUltima } from './logica';

function Boton({ texto, onPress, secundario, apagado }: { texto: string; onPress: () => void; secundario?: boolean; apagado?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={apagado} onPress={onPress} style={[e.boton, secundario ? e.botonSecundario : null, apagado ? e.apagado : null]}>
      <Text style={[e.botonTexto, secundario ? e.botonTextoSecundario : null]}>{texto}</Text>
    </Pressable>
  );
}

/** «Hay una versión nueva de la app»: notas, Instalar y Más tarde (24 h). Cerrar cuenta como Más tarde. */
export function AvisoVersionNueva({ apk, ocupado, error, onInstalar, onMasTarde }: { apk: ApkUltima | null; ocupado: string | null; error: string | null; onInstalar: () => void; onMasTarde: () => void }) {
  return (
    <Modal visible={apk !== null} transparent animationType="fade" onRequestClose={onMasTarde}>
      <View style={e.fondo}>
        {apk ? (
          <View style={e.tarjeta}>
            <Text style={e.titulo}>Hay una versión nueva de la app</Text>
            <Text style={e.negrita}>{`Versión ${apk.versionName} (${tamanoTexto(apk.tamanoBytes)})`}</Text>
            {apk.notas ? <Text style={e.texto}>{apk.notas}</Text> : null}
            <Text style={e.nota}>Al tocar Instalar se descarga y el teléfono te pide confirmar. Tus datos se conservan.</Text>
            {error ? <Text style={e.error}>{error}</Text> : null}
            <Boton texto={ocupado ?? 'Instalar'} apagado={ocupado !== null} onPress={onInstalar} />
            <Boton texto="Más tarde" secundario apagado={ocupado !== null} onPress={onMasTarde} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/** Versión obligatoria: cubre toda la app, sin «Después». Solo aparece con respuesta real del servidor (nunca sin red). */
export function PantallaActualiza({ apk, ocupado, error, onInstalar }: { apk: ApkUltima | null; ocupado: string | null; error: string | null; onInstalar: () => void }) {
  if (apk === null) return null;
  return (
    <View style={e.cubre}>
      <Text style={e.titulo}>Actualiza la app para seguir</Text>
      <Text style={e.texto}>{`Esta versión ya no se puede usar. Instala la versión ${apk.versionName} (${tamanoTexto(apk.tamanoBytes)}) para continuar.`}</Text>
      {apk.notas ? <Text style={e.nota}>{apk.notas}</Text> : null}
      {error ? <Text style={e.error}>{error}</Text> : null}
      <Boton texto={ocupado ?? 'Descargar e instalar'} apagado={ocupado !== null} onPress={onInstalar} />
      <Text style={e.nota}>Tus datos se conservan. El teléfono te pide confirmar la instalación.</Text>
    </View>
  );
}

/** Barra discreta: hay una actualización lista pero había trabajo sin guardar, así que no se reinició sola. */
export function AvisoActualizacionLista({ onReiniciar, onDespues }: { onReiniciar: () => void; onDespues: () => void }) {
  return (
    <View pointerEvents="box-none" style={e.barraPos}>
      <View style={e.barra}>
        <Text style={e.negrita}>Hay una actualización lista</Text>
        <Boton texto="Reiniciar y aplicar" onPress={onReiniciar} />
        <Boton texto="Después" secundario onPress={onDespues} />
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  tarjeta: { gap: 12, padding: 20, borderRadius: 16, backgroundColor: '#ffffff' },
  cubre: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000, justifyContent: 'center', gap: 16, padding: 24, backgroundColor: '#ffffff' },
  barraPos: { position: 'absolute', left: 0, right: 0, bottom: 24, paddingHorizontal: 16 },
  barra: { gap: 8, padding: 16, borderRadius: 16, backgroundColor: '#ffffff', elevation: 8 },
  titulo: { fontSize: 22, fontWeight: '700', color: '#111111' },
  negrita: { fontSize: 18, fontWeight: '700', color: '#111111' },
  texto: { fontSize: 18, color: '#333333' },
  nota: { fontSize: 15, color: '#555555' },
  error: { fontSize: 16, color: '#b91c1c' },
  boton: { minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b45309' },
  botonSecundario: { backgroundColor: '#f3f4f6' },
  apagado: { opacity: 0.5 },
  botonTexto: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  botonTextoSecundario: { color: '#111111' },
});
