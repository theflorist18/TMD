import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { devSkipAuth } from '@/api/client';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthed } = useAuth();
  const loc = useLocation();

  if (devSkipAuth() || isAuthed) return <>{children}</>;

  return <Navigate to="/access" replace state={{ from: loc.pathname }} />;
}
