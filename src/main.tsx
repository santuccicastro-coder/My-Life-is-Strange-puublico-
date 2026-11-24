import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import {isChunkOrModuleLoadError, triggerGuardedChunkReload} from './components/ErrorBoundary';
import './index.css';

// Proteção global contra erros de carregamento de módulos desatualizados após build/deploy
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    triggerGuardedChunkReload();
  });

  window.addEventListener('error', (event) => {
    if (isChunkOrModuleLoadError(event.error ?? event.message)) {
      event.preventDefault();
      triggerGuardedChunkReload();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkOrModuleLoadError(event.reason)) {
      event.preventDefault();
      triggerGuardedChunkReload();
      return;
    }
    const reasonName =
      event.reason && typeof event.reason === 'object' && 'name' in event.reason
        ? String((event.reason as {name?: unknown}).name)
        : '';
    if (reasonName === 'AbortError') {
      event.preventDefault();
    }
  });
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
});

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
