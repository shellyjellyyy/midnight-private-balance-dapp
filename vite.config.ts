import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
  ],
  server: {
    port: 5173,
  },
  build: {
    target: 'esnext', // required for top-level await used by Midnight's proving libs
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
