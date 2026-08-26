import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El frontend habla SIEMPRE con nuestra API, nunca con Scryfall / YGOPRODeck /
// Pokemon TCG directamente (ADR-002). El proxy deja eso explicito ya en dev.
//
// El destino es configurable porque en Docker (T-004) la API no esta en
// 127.0.0.1 —dentro del contenedor eso seria el propio contenedor— sino en el
// servicio `api` de la red de compose.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

// Los bind mounts de Docker en Windows no propagan eventos inotify al
// contenedor: sin sondeo, el recargado en caliente no ve ningun cambio.
const usePolling = process.env.VITE_USE_POLLING === '1';

// Vite rechaza con 403 las peticiones cuyo Host no reconoce, y dentro de la red
// de compose el Host es el nombre del servicio ("web"), no localhost. Sin esto
// la suite E2E recibe "Blocked request" en vez de la aplicacion (P-028).
//
// Va por entorno y no cableado: la proteccion existe por un motivo y quien la
// abre debe decir para quien.
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter((h) => h !== '');

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/images': { target: apiTarget, changeOrigin: true },
      '/api': { target: apiTarget, changeOrigin: true },
    },
    ...(usePolling ? { watch: { usePolling: true, interval: 300 } } : {}),
    ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
  },
});
