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

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/images': { target: apiTarget, changeOrigin: true },
      '/api': { target: apiTarget, changeOrigin: true },
    },
    ...(usePolling ? { watch: { usePolling: true, interval: 300 } } : {}),
  },
});
