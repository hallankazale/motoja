import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SharedRide } from './features/SharedRide';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="shared-page"><h1>Não foi possível abrir esta tela.</h1><p>Recarregue para recuperar os dados da sua conta. Nenhuma corrida será enviada automaticamente.</p><a className="button primary" href="/">Reabrir MotoJá</a></main> : this.props.children; }
}
const sharedToken = new URLSearchParams(window.location.hash.slice(1)).get('acompanhar');
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary>{sharedToken ? <SharedRide token={sharedToken} /> : <App />}</ErrorBoundary></StrictMode>);
