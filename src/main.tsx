import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register service worker for installable PWA support with advanced background update handling
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker registered successfully:', reg.scope);

        // Check for updates on page load and periodically
        const checkForUpdates = () => {
          if (navigator.onLine) {
            reg.update().catch((err) => console.warn('[PWA] Update check failed:', err));
          }
        };

        // Check every 30 minutes for new updates in background
        const updateInterval = setInterval(checkForUpdates, 30 * 60 * 1000);

        // Check for updates when the tab/app is focused or user returns
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            console.log('[PWA] App became visible, checking for updates...');
            checkForUpdates();
          } else {
            // Smart auto-update: If the app is moved to background and there is a waiting update,
            // we skip waiting so that the next time they open the app, it is already updated!
            if (reg.waiting) {
              console.log('[PWA] App went to background with waiting update. Auto-activating...');
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        });

        // Helper to notify the React UI of a pending update
        const notifyUpdate = (worker: ServiceWorker) => {
          console.log('[PWA] A new update is available and waiting to be activated!');
          const event = new CustomEvent('pwa-update-available', {
            detail: { registration: reg, worker }
          });
          window.dispatchEvent(event);
        };

        // Track installing service worker state changes
        const trackInstalling = (worker: ServiceWorker) => {
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              notifyUpdate(worker);
            }
          });
        };

        // 1. If there's already a service worker waiting in background
        if (reg.waiting) {
          notifyUpdate(reg.waiting);
        }

        // 2. If there's currently an installing worker
        if (reg.installing) {
          trackInstalling(reg.installing);
        }

        // 3. Listen for new service workers starting to install
        reg.addEventListener('updatefound', () => {
          if (reg.installing) {
            trackInstalling(reg.installing);
          }
        });
      })
      .catch((err) => {
        console.error('[PWA] Service Worker registration failed:', err);
      });
  });

  // Smoothly reload when controller changes (i.e. new worker takes control)
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('[PWA] Controller changed. Reloading page smoothly...');
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
