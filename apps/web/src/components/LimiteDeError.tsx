import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ES } from '../i18n/es.js';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Que un fallo de UNA pantalla no deje en blanco la aplicacion entera (P-043).
 *
 * Sin esto, React desmonta el arbol completo ante un error de render: la
 * cabecera, la navegacion, todo. Es lo que paso con la cache de sets -- la
 * pagina quedaba en blanco y no habia ni un enlace para salir. Con el limite se
 * cae solo el contenido, la navegacion sigue ahi y el error se ve.
 *
 * NO lo esconde. React sigue registrandolo en la consola, y la prueba E2E que
 * vigila los errores de consola lo sigue cazando: el limite cambia lo que ve el
 * usuario, no lo que ve quien depura.
 *
 * Es una clase porque los limites de error todavia no tienen equivalente con
 * hooks en React 18.
 */
export class LimiteDeError extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error de render capturado por LimiteDeError', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="aviso error" role="alert">
        <p>{ES.error.pantallaRota}</p>
        <button type="button" onClick={() => window.location.reload()}>{ES.error.recargar}</button>
      </div>
    );
  }
}
