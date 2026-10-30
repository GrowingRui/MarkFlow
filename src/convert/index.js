// Turns a File into Markdown. Each converter, and the libraries it needs, loads only when a
// file of that type is converted.
import { fail, loadModule } from './errors.js';

export { fail };

const CONVERTERS = {
  pdf: () => import('./pdf.js').then(m => m.pdfToMd),
  docx: () => import('./docx.js').then(m => m.docxToMd),
  pptx: () => import('./pptx.js').then(m => m.pptxToMd),
  xlsx: () => import('./sheet.js').then(m => m.sheetToMd),
  xls: () => import('./sheet.js').then(m => m.sheetToMd),
  csv: () => import('./sheet.js').then(m => m.csvToMd),
  html: () => import('./html.js').then(m => m.htmlFileToMd),
  htm: () => import('./html.js').then(m => m.htmlFileToMd),
  json: () => import('./code.js').then(m => m.jsonToMd),
  xml: () => import('./code.js').then(m => m.xmlToMd),
  ipynb: () => import('./code.js').then(m => m.ipynbToMd),
  epub: () => import('./epub.js').then(m => m.epubToMd),
  zip: () => import('./zip.js').then(m => m.zipToMd),
  png: () => import('./ocr.js').then(m => m.imageToMd),
  jpg: () => import('./ocr.js').then(m => m.imageToMd),
  jpeg: () => import('./ocr.js').then(m => m.imageToMd),
  webp: () => import('./ocr.js').then(m => m.imageToMd),
};

export const extOf = name => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
export const isSupported = ext => Object.hasOwn(CONVERTERS, ext);

/**
 * @param {File} file
 * @param {{ progress: (text: string) => void, warn: (text: string) => void, ocrMode: 'Auto' | 'Always' | 'Off' }} ctx
 */
export async function convertFile(file, ctx) {
  const ext = extOf(file.name);
  if (!isSupported(ext)) throw fail(`${ext ? `.${ext} files aren’t` : 'Files without an extension aren’t'} supported. Use PDF, DOCX, PPTX, XLSX, XLS, HTML, CSV, JSON, XML, IPYNB, EPUB, ZIP, PNG, JPG, or WEBP.`);
  const convert = await loadModule(CONVERTERS[ext]());
  return (await convert(file, ctx)).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
