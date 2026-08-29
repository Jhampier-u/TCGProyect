import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.js';
import { Catalogo } from './pages/Catalogo.js';
import { Acceso } from './pages/Acceso.js';
import { Sobres } from './pages/Sobres.js';
import { Coleccion } from './pages/Coleccion.js';
import { Mazos } from './pages/Mazos.js';
import { MazoEditor } from './pages/MazoEditor.js';
import { ES } from './i18n/es.js';

/** Ruta que exige sesion. Redirige a /acceso conservando la intencion. */
function Protegida({ children }: { children: React.ReactNode }) {
  const { user, cargando } = useAuth();
  // Sin este estado intermedio, al recargar la pagina se veria un parpadeo
  // hacia /acceso mientras se valida el token guardado.
  if (cargando) return <div className="vacio">Comprobando sesion...</div>;
  if (!user) return <Navigate to="/acceso" replace />;
  return <>{children}</>;
}

export function App() {
  const { user, salir } = useAuth();

  return (
    <>
      <header className="cabecera">
        <span className="marca">{ES.navegacion.marca}</span>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'activo' : '')}>
            {ES.navegacion.catalogo}
          </NavLink>
          <NavLink to="/sobres" className={({ isActive }) => (isActive ? 'activo' : '')}>
            {ES.navegacion.sobres}
          </NavLink>
          <NavLink to="/coleccion" className={({ isActive }) => (isActive ? 'activo' : '')}>
            {ES.navegacion.coleccion}
          </NavLink>
          <NavLink to="/mazos" className={({ isActive }) => (isActive ? 'activo' : '')}>
            {ES.navegacion.mazos}
          </NavLink>
        </nav>
        <div className="cabecera-derecha">
          {user ? (
            <>
              <span style={{ color: 'var(--texto-tenue)' }}>{user.displayName}</span>
              <button onClick={salir}>{ES.navegacion.salir}</button>
            </>
          ) : (
            <NavLink to="/acceso">{ES.navegacion.acceder}</NavLink>
          )}
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Catalogo />} />
          <Route path="/acceso" element={<Acceso />} />
          <Route path="/sobres" element={<Protegida><Sobres /></Protegida>} />
          <Route path="/coleccion" element={<Protegida><Coleccion /></Protegida>} />
          <Route path="/mazos" element={<Protegida><Mazos /></Protegida>} />
          <Route path="/mazos/:id" element={<Protegida><MazoEditor /></Protegida>} />
          <Route path="*" element={<div className="vacio">{ES.error.paginaNoEncontrada}</div>} />
        </Routes>
      </main>
    </>
  );
}
