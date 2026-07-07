import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { colors } from '@adn/ui-tokens';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/lib/auth-store';
import { inicializarBaseLocal } from './src/db/client';

// Sin EXPO_PUBLIC_SENTRY_DSN el SDK no envía nada (no-op) — listo para activarse solo con la variable de entorno.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  // Los errores se reportan siempre; solo las trazas de performance se
  // muestrean — al 100% instrumentan cada interacción y pesan en producción.
  tracesSampleRate: __DEV__ ? 1.0 : 0.15,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Los datos son locales (SQLite) y solo cambian cuando la propia app
      // los invalida con invalidateQueries — refetchear por montar la
      // pantalla o recuperar el foco solo repite trabajo.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    inicializarBaseLocal();
    hydrate().finally(() => setReady(true));
  }, [hydrate]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand.blue} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <StatusBar style="auto" />
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});

export default Sentry.wrap(App);
