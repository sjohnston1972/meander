import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        debug: resolve(__dirname, 'debug.html'),
      },
    },
  },
  worker: { format: 'es' },
  test: {
    include: ['test/**/*.test.js'],
  },
});
