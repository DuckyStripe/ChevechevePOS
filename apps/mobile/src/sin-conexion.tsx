import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RADIO_CONTROL, useTema, type Tema } from './tema';

/** Pantalla nativa cuando el panel no carga. Es la única pantalla propia junto con «actualiza la app». */
export function SinConexion({ onReintentar }: { onReintentar: () => void }) {
  const t = useTema();
  return (
    <View style={[estilos.caja, { backgroundColor: t.fondo }]}>
      <Text style={[estilos.titulo, { color: t.texto }]}>Sin conexión</Text>
      <Text style={[estilos.texto, { color: t.suave }]}>No se pudo abrir el panel. Revisa que tengas internet y vuelve a intentar.</Text>
      <BotonMarca t={t} texto="Reintentar" onPress={onReintentar} />
    </View>
  );
}

/** Botón primario de 56 px (Caguama). */
export function BotonMarca({ t, texto, onPress }: { t: Tema; texto: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [estilos.boton, { backgroundColor: pressed ? t.marcaPresionada : t.marca }]}>
      <Text style={estilos.botonTexto}>{texto}</Text>
    </Pressable>
  );
}

/** `EXPO_PUBLIC_URL_PANEL` ausente o sin https: se dice claro en vez de cargar algo ajeno. */
export function MalConfigurada() {
  const t = useTema();
  return (
    <View style={[estilos.caja, { backgroundColor: t.fondo }]}>
      <Text style={[estilos.titulo, { color: t.texto }]}>App mal configurada</Text>
      <Text style={[estilos.texto, { color: t.suave }]}>Falta la dirección https del panel. Avisa a la oficina para instalar la versión correcta.</Text>
    </View>
  );
}

export const estilos = StyleSheet.create({
  caja: { flex: 1, justifyContent: 'center', gap: 16, padding: 24 },
  // Sin Bricolage Grotesque en el cascarón (no vale una fuente más en el APK): negrita del sistema.
  titulo: { fontSize: 24, fontWeight: '800' },
  texto: { fontSize: 18 },
  boton: { minHeight: 56, borderRadius: RADIO_CONTROL, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
});
