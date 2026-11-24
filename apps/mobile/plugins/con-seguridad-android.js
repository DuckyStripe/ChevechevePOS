/**
 * Endurecimiento Android del cascarón (versión corta del plugin de RefaccionPro).
 * `android/` no se versiona: todo sale de aquí en cada prebuild.
 *  - allowBackup=false y sin copia en la nube ni transferencia entre teléfonos.
 *  - Sin tráfico en texto plano en release (la variante debug lo conserva para Metro/web local).
 *  - Sin enlaces profundos externos: solo la actividad de arranque queda exportada y sin intent-filter VIEW/BROWSABLE
 *    (el push se atiende por la notificación, no por un esquema).
 *  - FCM sin analítica ni auto-inicio: el token solo se pide cuando el panel lo solicita (`pedir_push`).
 *  - Permisos que la app no usa: se declaran con tools:node="remove" para que Gradle los quite al fusionar.
 * Este plugin solo toca el manifiesto de la app. El manifiesto FUSIONADO (con lo que traen las librerías, p. ej. FCM
 * exportado o no) se revisa en la validación final, tras prebuild + assembleRelease; ahí se ajusta si hace falta.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

const EXTRACCION = 'reglas_extraccion_datos';

const PERMISOS_QUITADOS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_CONTACTS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'com.google.android.gms.permission.AD_ID',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
];

const META_FIREBASE = {
  firebase_analytics_collection_enabled: 'false',
  firebase_analytics_collection_deactivated: 'true',
  google_analytics_adid_collection_enabled: 'false',
  firebase_messaging_auto_init_enabled: 'false',
};

const XML_EXTRACCION = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por plugins/con-seguridad-android.js: nada sale del teléfono. -->
<data-extraction-rules>
  <cloud-backup><exclude domain="root" path="." /><exclude domain="file" path="." /><exclude domain="database" path="." /><exclude domain="sharedpref" path="." /><exclude domain="external" path="." /></cloud-backup>
  <device-transfer><exclude domain="root" path="." /><exclude domain="file" path="." /><exclude domain="database" path="." /><exclude domain="sharedpref" path="." /><exclude domain="external" path="." /></device-transfer>
</data-extraction-rules>
`;

const conArchivos = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xml = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xml, { recursive: true });
      fs.writeFileSync(path.join(xml, `${EXTRACCION}.xml`), XML_EXTRACCION);
      return cfg;
    },
  ]);

const esFiltroDeEnlace = (f) =>
  (f.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.VIEW') ||
  (f.category ?? []).some((c) => c.$['android:name'] === 'android.intent.category.BROWSABLE') ||
  (f.data ?? []).length > 0;

const esLanzador = (a) =>
  (a['intent-filter'] ?? []).some((f) => (f.action ?? []).some((x) => x.$['android:name'] === 'android.intent.action.MAIN'));

const conManifiesto = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    Object.assign(app.$, {
      'android:allowBackup': 'false',
      'android:fullBackupContent': 'false',
      'android:dataExtractionRules': `@xml/${EXTRACCION}`,
      'android:usesCleartextTraffic': 'false',
    });
    const reemplazar = new Set((app.$['tools:replace'] ?? '').split(',').filter(Boolean));
    ['android:allowBackup', 'android:fullBackupContent', 'android:dataExtractionRules'].forEach((a) => reemplazar.add(a));
    app.$['tools:replace'] = [...reemplazar].join(',');

    for (const [nombre, valor] of Object.entries(META_FIREBASE)) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, nombre, valor, 'value');
    }

    for (const tipo of ['activity', 'service', 'receiver', 'provider', 'activity-alias']) {
      for (const comp of app[tipo] ?? []) {
        if (tipo === 'activity' && esLanzador(comp)) {
          comp.$['android:exported'] = 'true';
          comp['intent-filter'] = (comp['intent-filter'] ?? []).filter((f) => !esFiltroDeEnlace(f));
        } else {
          comp.$['android:exported'] = 'false';
          delete comp['intent-filter'];
        }
      }
    }

    const lista = (manifest['uses-permission'] ?? []).filter((p) => !PERMISOS_QUITADOS.includes(p.$['android:name']));
    manifest['uses-permission'] = [
      ...lista,
      ...PERMISOS_QUITADOS.map((n) => ({ $: { 'android:name': n, 'tools:node': 'remove' } })),
    ];
    return cfg;
  });

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function conSeguridadAndroid(config) {
  return conManifiesto(conArchivos(config));
};
