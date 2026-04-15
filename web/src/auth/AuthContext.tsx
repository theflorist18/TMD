import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearTokens,
  devSkipAuth,
  getStoredAccessToken,
  persistTokens,
} from '@/api/client';

type AuthCtx = {
  accessToken: string | null;
  /** Called after successful login (tokens already persisted). */
  setSession: (access: string, refresh: string) => void;
  logout: () => void;
  isAuthed: boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    getStoredAccessToken()
  );

  const setSession = useCallback((access: string, refresh: string) => {
    persistTokens(access, refresh);
    setAccessToken(access);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setAccessToken(null);
  }, []);

  const isAuthed = Boolean(devSkipAuth() || accessToken);

  const value = useMemo(
    () => ({ accessToken, setSession, logout, isAuthed }),
    [accessToken, setSession, logout, isAuthed]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
