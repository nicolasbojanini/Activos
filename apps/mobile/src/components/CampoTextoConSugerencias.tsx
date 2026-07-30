import { useMemo } from 'react';
import { Pressable, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { soloLetras } from '../lib/validacion-texto';

const MAXIMO_SUGERENCIAS_MOSTRADAS = 6;

interface Props {
  valor: string;
  onChangeTexto: (texto: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  /** Filtra en tiempo real cualquier carácter que no sea letra — usado solo en el campo Nombre. */
  soloLetrasActivo?: boolean;
  /** Valores ya escritos por el equipo en este mismo campo/proyecto (espejo local), de más a menos frecuentes. */
  sugerencias?: string[];
  error?: string;
}

/**
 * Input de texto con autocompletar por chips debajo — no depende de
 * focus/blur para mostrarlas/ocultarlas (evita la carrera típica en RN entre
 * el blur del TextInput y el press del chip): las sugerencias que ya no
 * matchean el texto escrito (o que ya son exactamente el texto escrito)
 * simplemente dejan de listarse, con o sin foco.
 */
export function CampoTextoConSugerencias({
  valor,
  onChangeTexto,
  placeholder,
  keyboardType,
  soloLetrasActivo,
  sugerencias,
  error,
}: Props) {
  const coincidencias = useMemo(() => {
    const consulta = valor.trim().toLowerCase();
    if (!sugerencias || !consulta) return [];
    return sugerencias
      .filter((s) => s.toLowerCase().startsWith(consulta) && s.toLowerCase() !== consulta)
      .slice(0, MAXIMO_SUGERENCIAS_MOSTRADAS);
  }, [sugerencias, valor]);

  return (
    <View>
      <TextInput
        value={valor}
        onChangeText={(texto) => onChangeTexto(soloLetrasActivo ? soloLetras(texto) : texto)}
        style={[styles.input, error ? styles.inputError : null]}
        keyboardType={keyboardType}
        placeholder={placeholder}
      />
      {error && <Text style={styles.errorTexto}>{error}</Text>}
      {coincidencias.length > 0 && (
        <View style={styles.chipsWrap}>
          {coincidencias.map((s) => (
            <Pressable key={s} onPress={() => onChangeTexto(s)} style={styles.chip}>
              <Text style={styles.chipLabel}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = {
  input: {
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    fontSize: 14,
  },
  inputError: {
    borderColor: colors.state.danger,
  },
  errorTexto: {
    color: colors.state.danger,
    fontSize: 12,
    marginTop: spacing[1],
  },
  chipsWrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing[2],
    marginTop: spacing[2],
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.pill,
    paddingVertical: spacing[1] + 2,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.blue[50],
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.brand.blue,
  },
};
