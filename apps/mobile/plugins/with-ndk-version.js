// Unifica el NDK de todos los módulos nativos con el que fija la plantilla del proyecto
// (rootProject.ext.ndkVersion).
//
// Por qué: `expo-sqlite` 14 (Expo SDK 51) compila SQLite con CMake pero NO declara
// `ndkVersion`, así que Gradle usa el NDK por defecto de su versión del plugin de Android
// (25.1.8937393), que no está instalado en ninguna parte y que el descargador automático
// tampoco logra instalar ("SDK XML version 4"): el build se cuelga. Los demás módulos
// (expo-modules-core, react-native-screens...) sí leen rootProject.ext.ndkVersion. Con este
// plugin todos comparten el mismo NDK, y solo hay que instalar uno.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARCA = '// [adn] ndkVersion unificado';

const BLOQUE = `
${MARCA}
subprojects { subproject ->
  subproject.afterEvaluate {
    def android = subproject.extensions.findByName('android')
    if (android != null && rootProject.hasProperty('ndkVersion')) {
      android.ndkVersion = rootProject.ext.ndkVersion
    }
  }
}
`;

// El bloque tiene que ir ANTES de estas líneas: el plugin de raíz de React Native fuerza a
// evaluar los subproyectos al aplicarse, y después de eso ya no se puede registrar
// `afterEvaluate` ("Cannot run Project.afterEvaluate when the project is already evaluated").
const ANCLA = 'apply plugin: "com.facebook.react.rootproject"';

module.exports = function withNdkVersion(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('with-ndk-version: se esperaba un build.gradle en Groovy');
    }
    const contenido = cfg.modResults.contents;
    if (contenido.includes(MARCA)) return cfg;
    if (!contenido.includes(ANCLA)) {
      // Mejor fallar acá, claro, que dejar un build roto o colgado por el NDK.
      throw new Error(`with-ndk-version: no se encontró "${ANCLA}" en android/build.gradle; revisar la plantilla de Expo.`);
    }
    cfg.modResults.contents = contenido.replace(ANCLA, `${BLOQUE.trimStart()}\n${ANCLA}`);
    return cfg;
  });
};
