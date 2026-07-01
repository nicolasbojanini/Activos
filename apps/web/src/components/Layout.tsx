import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { ClipboardList, Package, FileBarChart, Users, LogOut } from 'lucide-react';
import { useAuthStore } from '../lib/auth-store';
import logoAdnWhite from '../assets/logo-adn-white.png';

const navItems = [
  { to: '/auditorias', label: 'Auditorías', icon: ClipboardList, enabled: true },
  { to: '/activos', label: 'Activos', icon: Package, enabled: false },
  { to: '/reportes', label: 'Reportes', icon: FileBarChart, enabled: true },
  { to: '/auditores', label: 'Auditores', icon: Users, enabled: false },
];

export function Layout({ children }: { children: ReactNode }) {
  const usuario = useAuthStore((s) => s.usuario);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const handleLogout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 240,
          background: 'var(--adn-black)',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 16px',
          flexShrink: 0,
        }}
      >
        <img src={logoAdnWhite} alt="adn" style={{ height: 24, objectFit: 'contain', marginBottom: 40, marginLeft: 8 }} />

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {navItems.map(({ to, label, icon: Icon, enabled }) =>
            enabled ? (
              <NavLink
                key={to}
                to={to}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--adn-radius-md)',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                  background: isActive ? 'var(--adn-blue)' : 'transparent',
                })}
              >
                <Icon size={18} strokeWidth={1.8} />
                {label}
              </NavLink>
            ) : (
              <span
                key={to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--adn-radius-md)',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.3)',
                  cursor: 'default',
                }}
                title="Próximamente"
              >
                <Icon size={18} strokeWidth={1.8} />
                {label}
              </span>
            ),
          )}
        </nav>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 16, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{usuario?.nombre}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>{usuario?.email}</div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.65)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <LogOut size={16} strokeWidth={1.8} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, background: 'var(--adn-ink-50)', padding: 32, overflowY: 'auto' }}>{children}</main>
    </div>
  );
}
