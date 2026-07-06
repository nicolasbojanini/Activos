import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../lib/auth-store';
import { LoginScreen } from '../screens/LoginScreen';
import { InicioScreen } from '../screens/InicioScreen';
import { EscaneoScreen } from '../screens/EscaneoScreen';
import { DetalleScreen } from '../screens/DetalleScreen';
import { ActualizarScreen } from '../screens/ActualizarScreen';
import { NoRegistradoScreen } from '../screens/NoRegistradoScreen';
import { UbicacionNoRegistradaScreen } from '../screens/UbicacionNoRegistradaScreen';
import { ConfirmacionScreen } from '../screens/ConfirmacionScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const accessToken = useAuthStore((s) => s.accessToken);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!accessToken ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Inicio" component={InicioScreen} />
          <Stack.Screen name="Escaneo" component={EscaneoScreen} options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="Detalle" component={DetalleScreen} />
          <Stack.Screen name="Actualizar" component={ActualizarScreen} />
          <Stack.Screen name="NoRegistrado" component={NoRegistradoScreen} />
          <Stack.Screen name="UbicacionNoRegistrada" component={UbicacionNoRegistradaScreen} />
          <Stack.Screen name="Confirmacion" component={ConfirmacionScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
