import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { ES } from '../i18n/es.js';

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
      setError(err instanceof ApiError ? err.message : ES.acceso.errorGenerico);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="formulario">
      <div className="tarjeta">
        <h1>{modo === 'login' ? ES.acceso.tituloEntrar : ES.acceso.tituloCrear}</h1>
        <p className="subtitulo">
          {modo === 'login'
            ? ES.acceso.invitacionEntrar
            : ES.acceso.invitacionCrear}
        </p>

        {error && <div className="aviso error">{error}</div>}

        <form onSubmit={enviar}>
          <div className="campo">
            <label htmlFor="email">{ES.acceso.correo}</label>
            <input id="email" type="email" value={email} required
              onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>

          {modo === 'registro' && (
            <div className="campo">
              <label htmlFor="nombre">{ES.acceso.nombreVisible}</label>
              <input id="nombre" value={displayName} required minLength={2}
                onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
            </div>
          )}

          <div className="campo">
            <label htmlFor="password">{ES.acceso.contrasena}</label>
            <input id="password" type="password" value={password} required
              minLength={modo === 'registro' ? 10 : undefined}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'} />
          </div>

          <button type="submit" className="primario" disabled={enviando} style={{ width: '100%' }}>
            {enviando ? ES.acceso.enviando : modo === 'login' ? ES.acceso.tituloEntrar : ES.acceso.tituloCrear}
          </button>
        </form>

        <p style={{ marginTop: 16, fontSize: 13.5 }}>
          {modo === 'login' ? `${ES.acceso.noTienesCuenta} ` : `${ES.acceso.yaTienesCuenta} `}
          <a href="#" onClick={(e) => { e.preventDefault(); setError(null); setModo(modo === 'login' ? 'registro' : 'login'); }}>
            {modo === 'login' ? ES.acceso.crearUna : ES.acceso.tituloEntrar}
          </a>
        </p>
      </div>
    </div>
  );
}
