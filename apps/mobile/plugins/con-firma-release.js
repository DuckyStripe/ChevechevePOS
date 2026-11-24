// Firma la APK de release con la llave propia (nunca con la debug.keystore pública de Expo).
// La llave y sus contraseñas NO están en git: viven en ~/.chevecheve-actualizaciones/ del servidor y se cargan con
//   source ~/.chevecheve-actualizaciones/android-release.env
// antes de compilar (CHV_APK_ALMACEN, CHV_APK_ALMACEN_CLAVE, CHV_APK_ALIAS, CHV_APK_LLAVE_CLAVE).
// Sin ellas una compilación de release FALLA a propósito; las de desarrollo (debug) siguen igual.
// Guía: docs/deploy/actualizar-app.md. Copia adaptada de chachaplancha (with-release-signing).
const { withAppBuildGradle } = require('expo/config-plugins');

const MARCA = '// chevecheve-firma-release';

const FIRMA = `
${MARCA}
def chvAlmacen = System.getenv('CHV_APK_ALMACEN')
android.signingConfigs {
    chvRelease {
        if (chvAlmacen) {
            storeFile file(chvAlmacen)
            storePassword System.getenv('CHV_APK_ALMACEN_CLAVE')
            keyAlias System.getenv('CHV_APK_ALIAS')
            keyPassword System.getenv('CHV_APK_LLAVE_CLAVE')
        }
    }
}
android.buildTypes.release.signingConfig = android.signingConfigs.chvRelease
gradle.taskGraph.whenReady { graph ->
    def pideRelease = graph.allTasks.any { it.name.toLowerCase().contains('release') && (it.name.startsWith('assemble') || it.name.startsWith('bundle') || it.name.startsWith('package')) }
    if (pideRelease && !chvAlmacen) {
        throw new GradleException('Falta la llave de firma: corre "source ~/.chevecheve-actualizaciones/android-release.env" antes de compilar (ver docs/deploy/actualizar-app.md).')
    }
}
`;

module.exports = function conFirmaRelease(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('con-firma-release: se esperaba build.gradle en Groovy');
    if (!cfg.modResults.contents.includes(MARCA)) cfg.modResults.contents += FIRMA;
    return cfg;
  });
};
