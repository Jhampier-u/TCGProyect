import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El frontend habla SIEMPRE con nuestra API, nunca con Scryfall / YGOPRODeck /
// Pokemon TCG directamente (ADR-002). El proxy deja eso explicito ya en dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/images': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
});
