import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadModule } from './errors.js';
import { joinBlocks } from './markdown.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function pdfToMd(file, ctx) {
  ctx.progress('Opening PDF…');
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.progress(`Reading page ${n} of ${doc.numPages}…`);
    const page = await doc.getPage(n);
    const lines = pdfLines((await page.getTextContent()).items);
    const chars = lines.reduce((sum, l) => sum + l.text.trim().length, 0);
    if (ctx.ocrMode === 'Always' || (ctx.ocrMode === 'Auto' && chars < 20)) {
      const { ocr } = await loadModule(import('./ocr.js'));
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      ctx.progress(`Recognizing text on page ${n} of ${doc.numPages}…`);
      pages.push({ ocr: await ocr(canvas, ctx) });
    } else {
      pages.push({ lines });
    }
  }
  // The most common font size (weighted by text length) is treated as body text.
  const weight = {};
  for (const p of pages) for (const l of p.lines || []) weight[l.size] = (weight[l.size] || 0) + l.text.length;
  const body = +Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
  return joinBlocks(pages.flatMap(p => p.ocr != null ? (p.ocr ? [p.ocr] : []) : pdfBlocks(p.lines, body)));
}

// Groups PDF.js text items into lines, top to bottom.
export function pdfLines(items) {
  const lines = [];
  const sorted = items.filter(it => it.str).map(it => ({
    str: it.str, x: it.transform[4], y: it.transform[5], w: it.width,
    size: Math.round(Math.hypot(it.transform[2], it.transform[3]) * 2) / 2,
  })).sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - it.y) < Math.max(line.size, it.size) * 0.5) {
      const gap = it.x - line.end;
      if (gap > it.size * 0.15 && !/\s$/.test(line.text) && !/^\s/.test(it.str)) line.text += ' ';
      line.text += it.str;
      line.end = it.x + it.w;
      line.size = Math.max(line.size, it.size);
    } else {
      lines.push({ text: it.str, x: it.x, y: it.y, size: it.size, end: it.x + it.w });
    }
  }
  return lines;
}

// Turns lines into Markdown blocks: headings by font size relative to body text, lists, paragraphs.
export function pdfBlocks(lines, body) {
  const blocks = [];
  let para = '';
  let prev = null;
  let itemX = null;
  const flush = () => { if (para) blocks.push(para); para = ''; };
  for (const line of lines) {
    const t = line.text.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const ratio = line.size / body;
    const bullet = t.match(/^[•●▪◦‣∙○■□➢►–]\s*(.*)/);
    const numbered = t.match(/^(\d{1,3})[.)]\s+(.*)/);
    if (ratio >= 1.15 && t.length < 120) {
      flush();
      itemX = null;
      const level = ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : 3;
      // Consecutive heading lines of the same size are one wrapped heading.
      const last = blocks[blocks.length - 1];
      if (prev?.heading === level && last?.startsWith('#'.repeat(level) + ' ')) blocks[blocks.length - 1] += ' ' + t;
      else blocks.push('#'.repeat(level) + ' ' + t);
      prev = { ...line, heading: level };
      continue;
    }
    if (bullet || numbered) {
      flush();
      blocks.push(bullet ? `- ${bullet[1]}` : `${numbered[1]}. ${numbered[2]}`);
      itemX = line.x;
    } else if (prev && !prev.heading && !para && itemX != null && line.x > itemX + line.size * 0.5 && prev.y - line.y < line.size * 1.6) {
      blocks[blocks.length - 1] += ' ' + t; // wrapped list item, indented past its bullet
    } else {
      if (prev && (prev.y - line.y > line.size * 1.8 || prev.y < line.y)) flush();
      itemX = null;
      para = !para ? t : /[a-z]-$/.test(para) ? para.slice(0, -1) + t : para + ' ' + t;
    }
    prev = line;
  }
  flush();
  return blocks;
}
