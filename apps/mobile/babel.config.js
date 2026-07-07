module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        // Sin console.* en el bundle release: hoy solo hay 2 warn en el
        // camino de sincronización, pero esto protege los hot paths de
        // cualquier log futuro. Los console.error se conservan (Sentry y
        // diagnóstico de crashes los aprovechan).
        plugins: [['transform-remove-console', { exclude: ['error'] }]],
      },
    },
  };
};
