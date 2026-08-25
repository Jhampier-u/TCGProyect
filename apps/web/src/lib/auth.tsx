import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, type AuthUser } from './api.js';

const CLAVE_TOKEN = 'tcg.token';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  registrar: (email: string, displayName: string, password: string) => Promise<void>;
  salir: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Sesion del usuario.
 *
 * El token vive en `localStorage`. Es la opcion pragmatica para una SPA que
 * habla con una API por Bearer, y conviene ser honesto sobre su coste: un XSS
 * puede leerlo, cosa que una cookie `httpOnly` evitaria. A cambio, la cookie
 * exigiria proteccion CSRF y un backend que gestione sesion.
 *
 * La mitigacion real esta en el token: caduca en 1 hora (ADR-008). Si el
 * proyecto llega a manejar algo mas sensible que una coleccion de cartas
 * virtuales, esta decision hay que revisarla.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(CLAVE_TOKEN));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al arrancar se valida el token guardado contra el servidor. Un token
  // caducado en localStorage haria que la interfaz se creyera con sesion y
  // fallara en la primera accion real.
  useEffect(() => {
    let cancelado = false;
    if (!token) {
      setCargando(false);
      setUser(null);
      return;
    }
    api
      .me(token)
      .then((r) => {
        if (!cancelado) setUser(r.data);
      })
      .catch((error: unknown) => {
        if (cancelado) return;
        if (error instanceof ApiError && error.status === 401) {
          localStorage.removeItem(CLAVE_TOKEN);
          setToken(null);
        }
        setUser(null);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const guardar = useCallback((nuevoToken: string, nuevoUser: AuthUser) => {
    localStorage.setItem(CLAVE_TOKEN, nuevoToken);
    setToken(nuevoToken);
    setUser(nuevoUser);
    setCargando(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api.login({ email, password });
      guardar(r.token, r.data);
    },
    [guardar],
  );

  const registrar = useCallback(
    async (email: string, displayName: string, password: string) => {
      const r = await api.register({ email, displayName, password });
      guardar(r.token, r.data);
    },
    [guardar],
  );

  const salir = useCallback(() => {
    localStorage.removeItem(CLAVE_TOKEN);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, token, cargando, login, registrar, salir }),
    [user, token, cargando, login, registrar, salir],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
