import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '@adn/ui-tokens';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'danger';
}

export function PrimaryButton({ label, onPress, disabled, variant = 'primary' }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'danger' && styles.danger,
        (disabled || pressed) && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === 'primary' && styles.labelPrimary,
          variant === 'outline' && styles.labelOutline,
          variant === 'danger' && styles.labelDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    borderRadius: radius.md,
    paddingVertical: spacing[3] + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.brand.blue,
    shadowColor: colors.brand.blue,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  outline: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.ink[200],
  },
  danger: {
    backgroundColor: colors.state.dangerBg,
  },
  label: { fontSize: 14, fontWeight: '600' },
  labelPrimary: { color: '#fff' },
  labelOutline: { color: colors.ink[700] },
  labelDanger: { color: colors.state.danger },
});
