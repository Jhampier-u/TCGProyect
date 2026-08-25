import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

/** Registro y acceso en una sola pantalla, alternando modo. */
export function Acceso() {
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { login, registrar } = useAuth();
  const navegar = useNavigate();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      if (modo === 'login') await login(email, password);
      else await registrar(email, displayName, password);
      navegar('/sobres');
    } catch (err) {
      // El servidor devuelve el MISMO mensaje tanto si el correo no existe como
      // si la contrasena es incorrecta (ADR-008). La interfaz no debe inventarse
      // uno mas especifico: seria deshacer esa proteccion desde el cliente.
      setError(err instanceof ApiError ? err.message : 'No se pudo completar la operacion');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="formulario">
      <div className="tarjeta">
        <h1>{modo === 'login' ? 'Acceder' : 'Crear cuenta'}</h1>
        <p className="subtitulo">
          {modo === 'login'
            ? 'Entra para abrir sobres y ver tu coleccion.'
            : 'La contrasena debe tener al menos 10 caracteres.'}
        </p>

        {error && <div className="aviso error">{error}</div>}

        <form onSubmit={enviar}>
          <div className="campo">
            <label htmlFor="email">Correo</label>
            <input id="email" type="email" value={email} required
              onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>

          {modo === 'registro' && (
            <div className="campo">
              <label htmlFor="nombre">Nombre visible</label>
              <input id="nombre" value={displayName} required minLength={2}
                onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
            </div>
          )}

          <div className="campo">
            <label htmlFor="password">Contrasena</label>
            <input id="password" type="password" value={password} required
              minLength={modo === 'registro' ? 10 : undefined}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'} />
          </div>

          <button type="submit" className="primario" disabled={enviando} style={{ width: '100%' }}>
            {enviando ? 'Enviando...' : modo === 'login' ? 'Acceder' : 'Crear cuenta'}
          </button>
        </form>

        <p style={{ marginTop: 16, fontSize: 13.5 }}>
          {modo === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setError(null); setModo(modo === 'login' ? 'registro' : 'login'); }}>
            {modo === 'login' ? 'Crear una' : 'Acceder'}
          </a>
        </p>
      </div>
    </div>
  );
}
