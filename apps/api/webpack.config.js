const path = require('node:path');
const nodeExternals = require('webpack-node-externals');

/** Bundlea @adn/* (paquetes del monorepo, distribuidos como TS fuente) en vez de tratarlos como externos. */
module.exports = (options) => ({
  ...options,
  externals: [
    nodeExternals({
      allowlist: [/^@adn\//],
    }),
    // Los clientes Prisma generados viven en apps/api/generated/ (fuera de
    // node_modules), así que nodeExternals no los detecta como externos por
    // defecto y webpack intentaría empaquetarlos. Se tratan igual que
    // @prisma/client: quedan como require() en tiempo de ejecución, para que
    // el motor de consultas (binario nativo) se resuelva desde su carpeta real.
    // OJO: dist/main.js es un único archivo plano (no conserva la profundidad
    // de src/), así que la ruta relativa original (ej. "../../generated/...")
    // quedaría mal calculada en runtime — se resuelve a una ruta ABSOLUTA acá,
    // en tiempo de build, para que sea correcta sin importar desde qué
    // archivo de src/ se haya importado.
    ({ context, request }, callback) => {
      if (request && /generated\/(control|tenant)-client/.test(request)) {
        const absoluto = path.resolve(context, request);
        return callback(null, `commonjs ${absoluto}`);
      }
      callback();
    },
  ],
  resolve: {
    ...options.resolve,
    extensions: ['.ts', '.js', ...(options.resolve?.extensions ?? [])],
  },
});
