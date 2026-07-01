import { Navigate, Outlet } from 'react-router';
import { useAuthStore } from '../lib/auth-store';

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
