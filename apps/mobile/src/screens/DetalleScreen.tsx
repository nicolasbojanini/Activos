import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '@adn/ui-tokens';
import type { ActivoDetailOutput } from '@adn/shared';
import { getActivo, crearRegistro } from '../lib/services';
import { useProyectoActual } from '../lib/useProyectoActual';
import { EstadoBadge } from '../components/EstadoBadge';
import { PrimaryButton } from '../components/PrimaryButton';
import { HeaderBar } from '../components/HeaderBar';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Detalle'>;

const ESTADO_FISICO_LABEL: Record<ActivoDetailOutput['estadoFisico'], string> = {
  BUENO: 'Bueno',
  REGULAR: 'Regular',
  MALO: 'Malo',
  BAJA: 'De baja',
};

function ficha(activo: ActivoDetailOutput) {
  return [
    { label: 'Placa', valor: activo.placa },
    { label: 'Código QR', valor: activo.codigoQR },
    { label: 'Nombre / descripción', valor: activo.nombre },
    { label: 'Categoría', valor: activo.categoria.replace('_', ' ') },
    { label: 'Marca', valor: activo.marca ?? '—' },
    { label: 'Modelo', valor: activo.modelo ?? '—' },
    { label: 'N° de serie', valor: activo.serie ?? '—' },
    { label: 'Ubicación', valor: activo.ubicacion?.sede ?? '—' },
    { label: 'Responsable', valor: activo.responsable ?? '—' },
    { label: 'Centro de costo', valor: activo.centroCosto ?? '—' },
    { label: 'Estado físico', valor: ESTADO_FISICO_LABEL[activo.estadoFisico] },
    {
      label: 'Fecha de adquisición',
      valor: activo.fechaAdquisicion ? new Date(activo.fechaAdquisicion).toLocaleDateString('es-CO') : '—',
    },
    { label: 'Valor en libros', valor: activo.valorLibros ? `$${Number(activo.valorLibros).toLocaleString('es-CO')}` : '—' },
    { label: 'Proveedor', valor: activo.proveedor ?? '—' },
    { label: 'Vida útil', valor: activo.vidaUtilMeses ? `${activo.vidaUtilMeses} meses` : '—' },
  ];
}

export function DetalleScreen({ route, navigation }: Props) {
  const { activoId, escaneado } = route.params;
  const { proyecto } = useProyectoActual();
  const [enviando, setEnviando] = useState(false);
  const queryClient = useQueryClient();

  const { data: activo, refetch } = useQuery({
    queryKey: ['activo', activoId],
    queryFn: () => getActivo(activoId),
  });

  const enviarRegistro = async (estado: 'AUDITADO' | 'FALTANTE') => {
    if (!proyecto || !activo) return;
    setEnviando(true);
    try {
      await crearRegistro({
        clientId: Crypto.randomUUID(),
        proyectoId: proyecto.id,
        activoId: activo.id,
        estado,
        auditadoEn: new Date(),
        fotos: [],
      });
      await queryClient.invalidateQueries({ queryKey: ['resumen'] });
      await queryClient.invalidateQueries({ queryKey: ['activos'] });
      await queryClient.invalidateQueries({ queryKey: ['activo', activoId] });
      navigation.replace('Confirmacion', {
        resultado: estado,
        titulo: estado === 'AUDITADO' ? 'Activo confirmado' : 'Faltante reportado',
        mensaje:
          estado === 'AUDITADO'
            ? 'El activo coincide con la ficha registrada.'
            : 'Se registró el activo como faltante en esta auditoría.',
        nombreActivo: activo.nombre,
        placa: activo.placa,
      });
    } catch {
      Alert.alert('Error', 'No se pudo guardar el registro. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  const confirmarFaltante = () => {
    Alert.alert('Reportar como faltante', '¿Confirmas que este activo no fue encontrado?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reportar', style: 'destructive', onPress: () => void enviarRegistro('FALTANTE') },
    ]);
  };

  if (!activo) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text>Cargando ficha…</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <HeaderBar
        title="Detalle del activo"
        subtitle={activo.placa}
        onBack={() => navigation.goBack()}
        rightBadge={escaneado ? 'Escaneado' : undefined}
      />

      <ScrollView contentContainerStyle={{ padding: spacing[4], paddingBottom: 160 }} onScrollEndDrag={() => void refetch()}>
        <Text style={styles.titulo}>{activo.nombre}</Text>
        <View style={styles.badgesRow}>
          <EstadoBadge estado={activo.estado} />
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Estado físico: {ESTADO_FISICO_LABEL[activo.estadoFisico]}</Text>
          </View>
        </View>

        <View style={styles.fichaCard}>
          {ficha(activo).map((campo, i) => (
            <View key={campo.label} style={[styles.fichaRow, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={styles.fichaLabel}>{campo.label}</Text>
              <Text style={styles.fichaValor}>{campo.valor}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.acciones}>
        <PrimaryButton
          label={enviando ? 'Guardando…' : 'Confirmar que coincide'}
          onPress={() => void enviarRegistro('AUDITADO')}
          disabled={enviando}
        />
        <View style={styles.accionesFila}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="Actualizar"
              variant="outline"
              onPress={() => navigation.navigate('Actualizar', { activoId })}
              disabled={enviando}
            />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="Diferencia"
              variant="danger"
              onPress={() => navigation.navigate('Actualizar', { activoId })}
              disabled={enviando}
            />
          </View>
        </View>
        <Text style={styles.faltanteLink} onPress={confirmarFaltante}>
          Reportar como faltante
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 20, fontWeight: '600', color: colors.brand.black, marginBottom: spacing[2] },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[4] },
  chip: { backgroundColor: colors.ink[100], borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 10 },
  chipLabel: { fontSize: 11, fontWeight: '600', color: colors.ink[600] },
  fichaCard: { borderWidth: 1, borderColor: colors.ink[200], borderRadius: radius.lg, overflow: 'hidden' },
  fichaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.ink[100],
  },
  fichaLabel: { fontSize: 13, color: colors.ink[500], flex: 1 },
  fichaValor: { fontSize: 13, fontWeight: '600', color: colors.brand.black, flex: 1, textAlign: 'right' },
  acciones: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.ink[200],
    padding: spacing[4],
    gap: spacing[2],
  },
  accionesFila: { flexDirection: 'row', gap: spacing[2] },
  faltanteLink: { textAlign: 'center', color: colors.state.danger, fontSize: 13, fontWeight: '600', marginTop: spacing[1] },
});
