import { View } from 'react-native';
import { Armchair, Cog, Hammer, Laptop, Package, Truck } from 'lucide-react-native';
import type { CategoriaActivo } from '@adn/shared';
import { colors, radius } from '@adn/ui-tokens';

const ICONOS: Record<CategoriaActivo, typeof Laptop> = {
  EQUIPOS_COMPUTO: Laptop,
  MOBILIARIO: Armchair,
  MAQUINARIA: Cog,
  VEHICULOS: Truck,
  HERRAMIENTAS: Hammer,
  OTRO: Package,
};

export function CategoriaIcon({ categoria, size = 20 }: { categoria: CategoriaActivo; size?: number }) {
  const Icon = ICONOS[categoria];
  return (
    <View
      style={{
        width: size + 20,
        height: size + 20,
        borderRadius: radius.md,
        backgroundColor: colors.blue[50],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={size} color={colors.brand.blue} strokeWidth={1.8} />
    </View>
  );
}
