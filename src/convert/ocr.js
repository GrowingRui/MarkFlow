// Text recognition for images and scanned PDF pages. The engine and English language data are
// served from this site (see vite.config.js), so nothing is fetched from a CDN.
import { createWorker, OEM } from 'tesseract.js';

const asset = path => new URL(import.meta.env.BASE_URL + path, location.href).href;

let worker;
export async function ocr(image, ctx) {
  if (!worker) {
    ctx.progress('Loading text recognition. This takes a moment the first time…');
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: asset('tesseract/worker.min.js'),
      corePath: asset('tesseract/core'),
      langPath: asset('tesseract/lang'),
    });
  }
  const { data } = await worker.recognize(image);
  return ocrTextToMd(data.text);
}

// Tesseract breaks lines where the image does; rejoin them into paragraphs.
export function ocrTextToMd(text) {
  return text.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n');
}

export async function imageToMd(file, ctx) {
  ctx.progress('Recognizing text…');
  return ocr(file, ctx);
}
