import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {flushPendingWrites} from './services/persistence.ts';
import './index.css';

// Las escrituras a IDB van con debounce (800ms) para no martillear el
// navegador. Si la app se cierra o pasa a segundo plano antes, ese cambio
// moriría en el debounce y el espejo de IDB quedaría obsoleto. Al volver
// después de una eviction de localStorage, el usuario perdería sus hábitos.
// Vaciamos el debounce en ambos eventos: 'pagehide' es el fiable de
// descarga/cierre, 'visibilitychange' cubre el cambio a segundo plano en
// móvil (donde 'pagehide' no siempre se dispara).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingWrites);
  window.addEventListener('beforeunload', flushPendingWrites);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingWrites();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
