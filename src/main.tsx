import './preamble.ts';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import 'leaflet/dist/leaflet.css';
import './index.css';

import { registerNotificationServiceWorker } from './utils/browserPushNotifications.ts';

try {
  localStorage.removeItem('szmc_text_size');
  document.documentElement.style.fontSize = '';
  const savedStyle = localStorage.getItem('szmc_app_visual_mode');
  if (savedStyle === 'glass' || savedStyle === 'clear-glass') {
    document.documentElement.setAttribute('data-app-style', savedStyle);
  }
} catch {}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    void registerNotificationServiceWorker();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
