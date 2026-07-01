import { useState, type CSSProperties, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router';
import { login } from '../lib/services';
import { useAuthStore } from '../lib/auth-store';
import { ApiError } from '../lib/api';
import logoAdnColor from '../assets/symbol-color.png';

export function Login() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (data) => {
      setSession(data);
      navigate('/auditorias', { replace: true });
    },
  });

  if (accessToken) {
    return <Navigate to="/auditorias" replace />;
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--adn-ink-50)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 360,
          background: '#fff',
          borderRadius: 'var(--adn-radius-xl)',
          border: '1px solid var(--adn-ink-200)',
          boxShadow: '0 1px 3px rgba(11,46,79,0.06)',
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <img src={logoAdnColor} alt="adn" style={{ height: 40 }} />
          <div style={{ textAlign: 'center' }}>
            <p className="eyebrow">AUDITORÍA DE ACTIVOS</p>
            <h1 style={{ fontSize: 20 }}>Inicia sesión</h1>
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
          Correo electrónico
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@empresa.com"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
          Contraseña
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
          />
        </label>

        {mutation.isError && (
          <div
            style={{
              background: 'var(--adn-danger-bg)',
              color: 'var(--adn-danger)',
              borderRadius: 'var(--adn-radius-md)',
              padding: '8px 12px',
              fontSize: 13,
            }}
          >
            {mutation.error instanceof ApiError ? mutation.error.message : 'No se pudo iniciar sesión'}
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          style={{
            background: 'var(--adn-blue)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--adn-radius-md)',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
            cursor: mutation.isPending ? 'default' : 'pointer',
            opacity: mutation.isPending ? 0.7 : 1,
            boxShadow: 'var(--shadow-brand)',
          }}
        >
          {mutation.isPending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--adn-radius-md)',
  border: '1px solid var(--adn-ink-200)',
  fontSize: 14,
  fontFamily: 'var(--adn-font-text)',
};
