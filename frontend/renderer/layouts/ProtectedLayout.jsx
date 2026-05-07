import { Outlet, Navigate } from 'react-router-dom';
import { useAuthContext } from '../features/auth/AuthContext';
import { ROUTES } from '../lib/constants';

export default function ProtectedLayout() {
  const { user, loading } = useAuthContext();

  if (loading) return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      background: 'var(--sidebar-bg, #071030)',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Ferreteria El Esfuerzo</div>
      <div style={{ color: '#8a9ec4', fontSize: 12 }}>Verificando sesión…</div>
    </div>
  );

  if (!user) return <Navigate to={ROUTES.LOGIN} replace />;
  return <Outlet />;
}
