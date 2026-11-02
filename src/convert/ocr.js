// Text recognition for images and scanned PDF pages. The engine and English language data are
// served from this site (see vite.config.js), so nothing is fetched from a CDN.
import { createWorker, OEM, PSM } from 'tesseract.js';
import { bodySize, pdfBlocks, pdfLayout, pdfLines, renderEmphasis } from './layout.js';
import { joinBlocks } from './markdown.js';

const asset = path => new URL(import.meta.env.BASE_URL + path, location.href).href;

let worker;
// Tesseract's reading of an image or canvas: { blocks, text }.
export async function recognize(image, ctx) {
  if (!worker) {
    ctx.progress('Loading text recognition. This takes a moment the first time…');
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: asset('tesseract/worker.min.js'),
      corePath: asset('tesseract/core'),
      langPath: asset('tesseract/lang'),
    });
    // Tesseract.js reads a page as one block of text unless told otherwise, which runs paragraphs
    // together and can drop large headings; automatic layout finds the page's separate blocks.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  }
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  return { blocks: data.blocks ?? [], text: data.text ?? '' };
}

// Tesseract often reads a round bullet as «, °, © or similar.
const BULLET = /^[«°©*+=•·●▪◦]{1,2}$/;
const median = xs => [...xs].sort((a, b) => a - b)[xs.length >> 1];

/**
 * Tesseract's words as positioned text items like a PDF page's, so the same layout code finds the
 * scan's columns, tables, lists and paragraphs. Pixel positions are divided by `scale` to give points,
 * with y measured up from the bottom of an image `height` pixels tall (by default, down to the lowest
 * word), offset by `bottom`, the page's own bottom edge.
 *
 * Tesseract's size estimates vary by a fifth or more between lines of the same text, which would read
 * as headings, so sizes up to 40% above the usual one count as body text, and larger ones within 15% of each
 * other share the largest of them.
 */
export function ocrItems(blocks, { scale = 1, bottom = 0, height } = {}) {
  const lines = blocks.flatMap(b => b.paragraphs ?? []).flatMap(p => p.lines ?? [])
    .filter(l => l.text?.trim() && l.words?.some(w => w.text?.trim()));
  if (!lines.length) return [];
  const sizeOf = l => median(l.words.map(w => w.font_size).filter(s => s > 0)) || l.bbox.y1 - l.bbox.y0;
  const sizes = lines.map(sizeOf);
  // The usual size, weighted by how much text has it.
  const body = median(lines.flatMap((l, i) => Array(Math.max(1, l.text.trim().length)).fill(sizes[i])));
  const large = [...new Set(sizes.filter(s => s >= body * 1.4))].sort((a, b) => b - a);
  const group = new Map();
  let top = Infinity;
  for (const s of large) {
    if (s < top * 0.85) top = s;
    group.set(s, top);
  }
  height ??= Math.max(...lines.map(l => l.bbox.y1));
  const items = [];
  lines.forEach((line, i) => {
    const size = (group.get(sizes[i]) ?? body) / scale;
    const base = line.baseline;
    const words = line.words.filter(w => w.text?.trim());
    words.forEach((w, j) => {
      // The word sits on its line's baseline, which may slope slightly across a scanned page.
      const y = base?.has_baseline
        ? base.y0 + (base.y1 - base.y0) * ((w.bbox.x0 - base.x0) / Math.max(1, base.x1 - base.x0))
        : w.bbox.y1;
      const str = j === 0 && words.length > 1 && BULLET.test(w.text.trim()) ? '•' : w.text.trim();
      items.push({ str, word: true, width: (w.bbox.x1 - w.bbox.x0) / scale, transform: [size, 0, 0, size, w.bbox.x0 / scale, (height - y) / scale + bottom] });
    });
  });
  return items;
}

// Plain Tesseract text, when no layout came back: lines are rejoined into paragraphs at blank lines.
export function ocrTextToMd(text) {
  return text.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n');
}

export async function imageToMd(file, ctx) {
  ctx.progress('Recognizing text…');
  const { blocks, text } = await recognize(file, ctx);
  const items = ocrItems(blocks);
  if (!items.length) return ocrTextToMd(text);
  const lines = pdfLayout(pdfLines(items));
  return joinBlocks(pdfBlocks(lines, bodySize(lines)).map(renderEmphasis));
}
