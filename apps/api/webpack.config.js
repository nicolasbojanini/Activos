const nodeExternals = require('webpack-node-externals');

/** Bundlea @adn/* (paquetes del monorepo, distribuidos como TS fuente) en vez de tratarlos como externos. */
module.exports = (options) => ({
  ...options,
  externals: [
    nodeExternals({
      allowlist: [/^@adn\//],
    }),
  ],
  resolve: {
    ...options.resolve,
    extensions: ['.ts', '.js', ...(options.resolve?.extensions ?? [])],
  },
});
