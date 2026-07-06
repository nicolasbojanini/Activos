import type { EstadoAuditoria } from '@adn/shared';

const ESTILOS: Record<EstadoAuditoria, { bg: string; color: string; label: string }> = {
  AUDITADO: { bg: 'var(--adn-success-bg)', color: 'var(--adn-success)', label: 'Auditado' },
  PENDIENTE: { bg: 'var(--adn-ink-100)', color: 'var(--adn-ink-600)', label: 'Pendiente' },
  DIFERENCIA: { bg: 'var(--adn-warning-bg)', color: 'var(--adn-warning)', label: 'Con diferencia' },
  FALTANTE: { bg: 'var(--adn-danger-bg)', color: 'var(--adn-danger)', label: 'Faltante' },
  NO_REGISTRADO: { bg: 'var(--adn-blue-50)', color: 'var(--adn-blue)', label: 'Activo nuevo' },
};

export function EstadoBadge({ estado }: { estado: EstadoAuditoria }) {
  const estilo = ESTILOS[estado];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: estilo.bg,
        color: estilo.color,
        borderRadius: 'var(--adn-radius-pill)',
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {estilo.label}
    </span>
  );
}
