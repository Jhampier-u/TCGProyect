import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.js';
import { Catalogo } from './pages/Catalogo.js';
import { Acceso } from './pages/Acceso.js';
import { Sobres } from './pages/Sobres.js';
import { Coleccion } from './pages/Coleccion.js';
import { Mazos } from './pages/Mazos.js';
import { MazoEditor } from './pages/MazoEditor.js';
import { Inicio } from './pages/Inicio.js';
import { Portada } from './pages/ptcg/Portada.js';
import { JuegoLayout } from './layouts/JuegoLayout.js';
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
        <NavLink to="/" className="marca">{ES.navegacion.marca}</NavLink>
        <nav className="nav">
          <NavLink to="/ptcg/catalogo" className={({ isActive }) => (isActive ? 'activo' : '')}>
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
          {/* La raiz es una eleccion de juego, no un catalogo con filtro (T-090).
              Mientras fuera lo segundo no habia seccion que personalizar. */}
          <Route path="/" element={<Inicio />} />
          <Route path="/acceso" element={<Acceso />} />

          {/* Lo de cada juego cuelga de su ruta y su `data-juego`. Hoy solo
              Pokemon: Magic y Yu-Gi-Oh! llegan cuando este valide el diseno. */}
          <Route path="/ptcg" element={<JuegoLayout juego="PTCG" />}>
            <Route index element={<Portada />} />
            <Route path="catalogo" element={<Catalogo />} />
          </Route>

          <Route path="/sobres" element={<Protegida><Sobres /></Protegida>} />
          <Route path="/coleccion" element={<Protegida><Coleccion /></Protegida>} />
          <Route path="/mazos" element={<Protegida><Mazos /></Protegida>} />
          <Route path="/mazos/:id" element={<Protegida><MazoEditor /></Protegida>} />

          {/* El catalogo vivia en la raiz y estara en marcadores. Redirigir
              cuesta una linea; un 404 en una URL que alguien guardo, no. */}
          <Route path="/catalogo" element={<Navigate to="/ptcg/catalogo" replace />} />

          <Route path="*" element={<div className="vacio">{ES.error.paginaNoEncontrada}</div>} />
        </Routes>
      </main>
    </>
  );
}
