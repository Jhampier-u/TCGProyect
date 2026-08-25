import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.js';
import { Catalogo } from './pages/Catalogo.js';
import { Acceso } from './pages/Acceso.js';
import { Sobres } from './pages/Sobres.js';
import { Coleccion } from './pages/Coleccion.js';

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
        <span className="marca">ProyectoTCG</span>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'activo' : '')}>
            Catalogo
          </NavLink>
          <NavLink to="/sobres" className={({ isActive }) => (isActive ? 'activo' : '')}>
            Abrir sobres
          </NavLink>
          <NavLink to="/coleccion" className={({ isActive }) => (isActive ? 'activo' : '')}>
            Mi coleccion
          </NavLink>
        </nav>
        <div className="cabecera-derecha">
          {user ? (
            <>
              <span style={{ color: 'var(--texto-tenue)' }}>{user.displayName}</span>
              <button onClick={salir}>Salir</button>
            </>
          ) : (
            <NavLink to="/acceso">Acceder</NavLink>
          )}
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Catalogo />} />
          <Route path="/acceso" element={<Acceso />} />
          <Route path="/sobres" element={<Protegida><Sobres /></Protegida>} />
          <Route path="/coleccion" element={<Protegida><Coleccion /></Protegida>} />
          <Route path="*" element={<div className="vacio">Pagina no encontrada.</div>} />
        </Routes>
      </main>
    </>
  );
}
