import { StyleSheet, Text, View } from 'react-native';
import type { EstadoAuditoria } from '@adn/shared';
import { colors, radius } from '@adn/ui-tokens';

const ESTILOS: Record<EstadoAuditoria, { bg: string; color: string; label: string }> = {
  AUDITADO: { bg: colors.state.successBg, color: colors.state.success, label: 'Auditado' },
  PENDIENTE: { bg: colors.ink[100], color: colors.ink[600], label: 'Pendiente' },
  DIFERENCIA: { bg: colors.state.warningBg, color: colors.state.warning, label: 'Con diferencia' },
  FALTANTE: { bg: colors.state.dangerBg, color: colors.state.danger, label: 'Faltante' },
  NO_REGISTRADO: { bg: colors.blue[50], color: colors.brand.blue, label: 'No registrado' },
};

export function EstadoBadge({ estado }: { estado: EstadoAuditoria }) {
  const estilo = ESTILOS[estado];
  return (
    <View style={[styles.badge, { backgroundColor: estilo.bg }]}>
      <Text style={[styles.label, { color: estilo.color }]}>{estilo.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  label: { fontSize: 11, fontWeight: '600' },
});
