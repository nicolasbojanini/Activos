// Metro para el móvil fuera del workspace de pnpm (ver pnpm-workspace.yaml y ANDROID6.md).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const paquetes = path.resolve(projectRoot, '../../packages');

const config = getDefaultConfig(projectRoot);

// @adn/shared y @adn/ui-tokens entran por `link:` y se consumen como TypeScript
// fuente desde packages/, así que Metro tiene que vigilarlos y seguir el symlink.
config.watchFolders = [paquetes];
config.resolver.unstable_enableSymlinks = true;

// Toda dependencia — incluida `zod`, que importan los archivos de packages/shared, donde
// no hay node_modules — se resuelve SOLO desde la instalación de mobile. Es lo que garantiza
// una única copia de React 18.2 en el bundle.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
