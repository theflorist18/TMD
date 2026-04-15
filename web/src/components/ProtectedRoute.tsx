import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { accessGateEnabled, devSkipAuth } from '@/api/client';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthed } = useAuth();
  const loc = useLocation();

  if (!accessGateEnabled() || devSkipAuth() || isAuthed) return <>{children}</>;

  return <Navigate to="/access" replace state={{ from: loc.pathname }} />;
}
