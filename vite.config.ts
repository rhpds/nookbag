import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: './src',
  build: {
    outDir: '../dist',
  },
  // Use subpath when served behind Traefik at /nookbag
  base: command === 'serve' ? '/nookbag/' : './',
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    hmr: {
      // Connect HMR via Traefik
      clientPort: 7080,
      path: '/nookbag',
    },
  },
}));
