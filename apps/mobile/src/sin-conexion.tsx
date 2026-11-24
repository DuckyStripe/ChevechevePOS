import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Pantalla nativa cuando el panel no carga. Es la única pantalla propia junto con «actualiza la app». */
export function SinConexion({ onReintentar }: { onReintentar: () => void }) {
  return (
    <View style={estilos.caja}>
      <Text style={estilos.titulo}>Sin conexión</Text>
      <Text style={estilos.texto}>No se pudo abrir el panel. Revisa que tengas internet y vuelve a intentar.</Text>
      <Pressable accessibilityRole="button" onPress={onReintentar} style={estilos.boton}>
        <Text style={estilos.botonTexto}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

/** `EXPO_PUBLIC_URL_PANEL` ausente o sin https: se dice claro en vez de cargar algo ajeno. */
export function MalConfigurada() {
  return (
    <View style={estilos.caja}>
      <Text style={estilos.titulo}>App mal configurada</Text>
      <Text style={estilos.texto}>Falta la dirección https del panel. Avisa a la oficina para instalar la versión correcta.</Text>
    </View>
  );
}

export const estilos = StyleSheet.create({
  caja: { flex: 1, justifyContent: 'center', gap: 16, padding: 24, backgroundColor: '#ffffff' },
  titulo: { fontSize: 24, fontWeight: '700', color: '#111111' },
  texto: { fontSize: 18, color: '#333333' },
  boton: { minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b45309' },
  botonTexto: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
});
