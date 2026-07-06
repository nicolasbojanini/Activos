import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { login } from '../lib/services';
import { useAuthStore } from '../lib/auth-store';
import { ApiError } from '../lib/api';
import { PrimaryButton } from '../components/PrimaryButton';

const symbolColor = require('../../assets/adn-symbol-color.png');

export function LoginScreen() {
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const resolverAsignacionActual = useAuthStore((s) => s.resolverAsignacionActual);

  const mutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: async (data) => {
      await setSession(data);
      await resolverAsignacionActual();
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Image source={symbolColor} style={styles.symbol} resizeMode="contain" />
        <Text style={styles.eyebrow}>AUDITORÍA DE ACTIVOS</Text>
        <Text style={styles.title}>Inicia sesión</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="nombre@empresa.com"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            style={styles.input}
          />
        </View>

        {mutation.isError && (
          <Text style={styles.error}>
            {mutation.error instanceof ApiError ? mutation.error.message : 'No se pudo iniciar sesión'}
          </Text>
        )}

        <PrimaryButton
          label={mutation.isPending ? 'Ingresando…' : 'Ingresar'}
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending || !email || !password}
        />
        {mutation.isPending && <ActivityIndicator style={{ marginTop: spacing[3] }} color={colors.brand.blue} />}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink[50],
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.ink[200],
    padding: spacing[8],
    alignItems: 'center',
  },
  symbol: { width: 40, height: 40, marginBottom: spacing[3] },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: colors.brand.blue,
    marginBottom: spacing[2],
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.brand.black, marginBottom: spacing[6] },
  field: { width: '100%', marginBottom: spacing[4] },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink[700], marginBottom: spacing[2] },
  input: {
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    fontSize: 14,
  },
  error: {
    color: colors.state.danger,
    backgroundColor: colors.state.dangerBg,
    borderRadius: radius.md,
    padding: spacing[2],
    fontSize: 13,
    marginBottom: spacing[3],
    width: '100%',
  },
});
