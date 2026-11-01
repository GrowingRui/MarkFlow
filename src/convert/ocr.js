// Text recognition for images and scanned PDF pages. The engine and English language data are
// served from this site (see vite.config.js), so nothing is fetched from a CDN.
import { createWorker, OEM } from 'tesseract.js';
import { joinBlocks } from './markdown.js';

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
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  return data.blocks?.length ? ocrBlocksToMd(data.blocks) : ocrTextToMd(data.text);
}

// Tesseract's blocks → paragraphs → lines, as Markdown. Tesseract often runs paragraphs together, so a
// paragraph is also split where a gap opens between lines, or after a line that ends a sentence well
// short of the paragraph's right edge; and it sometimes breaks one mid-sentence, so those are rejoined.
// Lines starting with a bullet or a number become list items.
export function ocrBlocksToMd(blocks) {
  const out = [];
  for (const block of blocks) {
    let para = null;
    for (const p of block.paragraphs) {
      const lines = p.lines.map(l => ({ text: l.text.trim(), ...l.bbox })).filter(l => l.text);
      if (!lines.length) continue;
      const height = median(lines.map(l => l.y1 - l.y0));
      const right = Math.max(...lines.map(l => l.x1));
      const width = right - Math.min(...lines.map(l => l.x0));
      lines.forEach((line, i) => {
        const prev = lines[i - 1];
        const item = line.text.match(LIST_ITEM);
        // A line starting in lowercase after an unfinished sentence carries on, whatever the layout says.
        const carriesOn = para && !item && /^[a-z]/.test(line.text) && !/[.!?:"”]$/.test(para);
        const brk = !carriesOn && (!para || item || !prev
          || line.y0 - prev.y1 > height * 0.75
          || (/[.!?:"”]$/.test(prev.text) && right - prev.x1 > width * 0.2));
        if (brk) {
          if (para) out.push(para);
          para = item ? (item[1] ? '- ' : `${item[2]}. `) + item[3] : line.text;
        } else {
          para = /[a-z]-$/.test(para) && /^[a-z]/.test(line.text) ? para.slice(0, -1) + line.text : para + ' ' + line.text;
        }
      });
    }
    if (para) out.push(para);
  }
  return joinBlocks(out);
}

// Tesseract often reads a round bullet as «, ° or ©.
const LIST_ITEM = /^(?:([•·●▪◦*«°©-])|(\d{1,3})[.)])\s+(.*)/;
const median = xs => [...xs].sort((a, b) => a - b)[xs.length >> 1];

// Plain Tesseract text, when no layout came back: lines are rejoined into paragraphs at blank lines.
export function ocrTextToMd(text) {
  return text.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n');
}

export async function imageToMd(file, ctx) {
  ctx.progress('Recognizing text…');
  return ocr(file, ctx);
}
