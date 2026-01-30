import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { auth } from './firebase'
import { signInAnonymously } from 'firebase/auth'

// Initialize anonymous auth
signInAnonymously(auth).catch(err => console.error("Auth error:", err));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: 'white', backgroundColor: '#333' }}>
          <h1>Ein Fehler ist aufgetreten.</h1>
          <p>Bitte überprüfe die Konsole (F12) für Details.</p>
          <pre style={{ color: 'red', overflow: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <p>Mögliche Ursache: Fehlende Firebase-Konfiguration in <code>src/firebase.ts</code>.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)