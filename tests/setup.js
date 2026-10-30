// In the browser PDF.js loads its worker from a bundled URL; under Node it needs a file URL instead.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import '../src/convert/pdf.js';

GlobalWorkerOptions.workerSrc = pathToFileURL(createRequire(import.meta.url).resolve('pdfjs-dist/build/pdf.worker.min.mjs')).href;
