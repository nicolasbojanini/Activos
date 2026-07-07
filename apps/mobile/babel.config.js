module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo está declarado como devDependency EXPLÍCITA en este
    // package.json: con la estructura estricta de pnpm (sin hoisting), un
    // preset que solo es dependencia transitiva de `expo` no resuelve desde
    // acá y Metro falla al cargar esta config (fue lo que rompió el build de
    // CI la primera vez que se agregó este archivo).
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
