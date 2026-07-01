import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, radius, spacing } from '@adn/ui-tokens';

interface HeaderBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightBadge?: string;
}

export function HeaderBar({ title, subtitle, onBack, rightBadge }: HeaderBarProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.left}>
          {onBack && (
            <Pressable onPress={onBack} hitSlop={12} style={{ marginRight: spacing[2] }}>
              <ChevronLeft size={22} color={colors.brand.black} />
            </Pressable>
          )}
          <View>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        {rightBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>{rightBadge}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.ink[200] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  title: { fontSize: 16, fontWeight: '600', color: colors.brand.black },
  subtitle: { fontFamily: 'monospace', fontSize: 12, color: colors.brand.blue, marginTop: 2 },
  badge: { backgroundColor: colors.blue[50], borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 10 },
  badgeLabel: { fontSize: 11, fontWeight: '600', color: colors.brand.blue },
});
