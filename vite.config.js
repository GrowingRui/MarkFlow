/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { api } from './server/vite-plugin.js';

export default defineConfig({
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  plugins: [
    api(),
    // Text recognition files, served from our own site instead of a CDN.
    // createWorker('eng') uses the LSTM engine, so only the LSTM builds of the core are needed.
    viteStaticCopy({
      targets: [
        { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: 'tesseract', rename: { stripBase: true } },
        { src: 'node_modules/tesseract.js-core/tesseract-core-*lstm.wasm.js', dest: 'tesseract/core', rename: { stripBase: true } },
        { src: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', dest: 'tesseract/lang', rename: { stripBase: true } },
      ],
    }),
  ],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    env: { PGLITE_DIR: 'memory://' },
  },
});
