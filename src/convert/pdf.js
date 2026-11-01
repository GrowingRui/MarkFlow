import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadModule } from './errors.js';
import { joinBlocks, mdTable } from './markdown.js';

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
      const [, bottom, , top] = page.view;
      pages.push({ lines, bottom, top });
    }
  }
  dropRunningLines(pages.filter(p => p.lines));
  for (const p of pages) if (p.lines) p.lines = pdfLayout(p.lines);
  // The most common font size (weighted by text length) is treated as body text.
  const weight = {};
  for (const p of pages) for (const l of p.lines || []) if (!l.table) weight[l.size] = (weight[l.size] || 0) + l.text.length;
  const body = +Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
  return joinBlocks(joinPages(pages.map(p => p.ocr != null ? (p.ocr ? [p.ocr] : []) : pdfBlocks(p.lines, body))));
}

// Removes running headers and footers: lines in the top or bottom 8% of the page whose text, with
// numbers ignored, repeats on at least half the pages (and three or more), and lone page numbers there.
export function dropRunningLines(pages) {
  const margin = (p, l) => l.y > p.top - (p.top - p.bottom) * 0.08 || l.y < p.bottom + (p.top - p.bottom) * 0.08;
  const key = l => l.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  const pageNumber = /^(page\s*)?#(\s*(of|\/)\s*#)?$|^[-–—]\s*#\s*[-–—]$/;
  const counts = new Map();
  for (const p of pages) for (const k of new Set(p.lines.filter(l => margin(p, l)).map(key))) counts.set(k, (counts.get(k) || 0) + 1);
  const repeats = k => pages.length >= 3 && counts.get(k) >= Math.max(3, pages.length / 2);
  for (const p of pages) p.lines = p.lines.filter(l => !(margin(p, l) && (repeats(key(l)) || (pages.length >= 2 && pageNumber.test(key(l))))));
}

// Joins a paragraph that runs over a page break: the last block of a page is a paragraph of some
// length that doesn't end a sentence, and the next page starts with a paragraph.
export function joinPages(pages) {
  const plain = b => b && !/^(#|- |\d+\. |\||```)/.test(b) && !b.includes('\n');
  const out = [];
  for (const blocks of pages) {
    const last = out[out.length - 1];
    if (plain(last) && last.length > 40 && !/[.!?:;"”)]$/.test(last) && plain(blocks[0])) {
      out[out.length - 1] = /[a-z]-$/.test(last) && /^[a-z]/.test(blocks[0]) ? last.slice(0, -1) + blocks[0] : last + ' ' + blocks[0];
      out.push(...blocks.slice(1));
    } else {
      out.push(...blocks);
    }
  }
  return out;
}

// Groups PDF.js text items into lines, top to bottom. Within a line, text separated by a gap of
// a character or more becomes its own segment, so columns and table cells can be told apart later.
export function pdfLines(items) {
  const rows = [];
  const sorted = items.filter(it => it.str).map(it => ({
    str: it.str, x: it.transform[4], y: it.transform[5], w: it.width,
    size: Math.round(Math.hypot(it.transform[2], it.transform[3]) * 2) / 2,
  })).sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - it.y) < Math.max(row.size, it.size) * 0.5) {
      row.items.push(it);
      row.size = Math.max(row.size, it.size);
    } else {
      rows.push({ y: it.y, size: it.size, items: [it] });
    }
  }
  return rows.map(row => {
    const segs = [];
    for (const it of row.items.sort((a, b) => a.x - b.x)) {
      const seg = segs[segs.length - 1];
      if (!it.str.trim()) {
        if (seg && !/\s$/.test(seg.text)) seg.text += ' ';
        continue;
      }
      const gap = seg ? it.x - seg.end : 0;
      // A lone bullet or number stays with its text however far apart they are.
      if (seg && (gap < row.size || MARKER.test(seg.text.trim()))) {
        if (gap > it.size * 0.15 && !/\s$/.test(seg.text) && !/^\s/.test(it.str)) seg.text += ' ';
        seg.text += it.str;
        seg.end = Math.max(seg.end, it.x + it.w);
      } else {
        segs.push({ text: it.str, x: it.x, end: it.x + it.w });
      }
    }
    return segs.length ? makeLine(segs, row) : null;
  }).filter(Boolean);
}

const MARKER = /^([•●▪◦‣∙○■□➢►–-]|\d{1,3}[.)])$/;
const makeLine = (segs, { y, size }) => ({
  text: segs.map(s => s.text.trim()).join(' '), x: segs[0].x, y, size, end: segs[segs.length - 1].end, segs,
});

// Puts lines in reading order: multi-column text is read column by column, and rows of short cells
// lined up under shared gaps become { table } entries. Full-width lines (titles, figures spanning
// the columns) split the page into bands that are handled one after another.
export function pdfLayout(lines, depth = 0) {
  const gutter = depth < 8 && findGutter(lines);
  if (!gutter) return lines;
  const out = [];
  let run = [];
  let crossing = null;
  const flushRun = () => {
    if (!run.length) return;
    out.push(...(crossing ? pdfLayout(run, depth + 1) : splitRun(run, gutter, depth)));
    run = [];
  };
  for (const line of lines) {
    const c = crosses(line, gutter);
    if (c !== crossing) flushRun();
    crossing = c;
    run.push(line);
  }
  flushRun();
  return out;
}

const median = xs => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const crosses = (line, { x, em }) => line.segs.some(s => s.x < x + em / 2 && s.end > x - em / 2);

// The x position with the most lines clear of it on both sides, needing at least one character
// of empty space. Lines that run through it are counted, and fewer of them wins a tie.
function findGutter(lines) {
  if (lines.length < 2) return null;
  const em = median(lines.map(l => l.size));
  const lo = Math.min(...lines.map(l => l.x));
  const hi = Math.max(...lines.map(l => l.end));
  let best = null;
  for (let x = Math.ceil(lo + em); x < hi - em; x++) {
    let left = 0, right = 0, cross = 0;
    for (const l of lines) {
      if (crosses(l, { x, em })) { cross++; continue; }
      if (l.segs.some(s => s.end <= x)) left++;
      if (l.segs.some(s => s.x >= x)) right++;
    }
    const score = Math.min(left, right);
    if (score >= 2 && (!best || score > best.score || (score === best.score && cross < best.cross))) best = { x, em, score, cross };
  }
  return best;
}

// A band of lines that all leave the gutter clear. Runs of table rows become tables; the rest is cut
// at blank strips across the page, and each piece is read as two columns, or in page order when one
// side has fewer than two lines (such as a page number beside a heading).
function splitRun(run, gutter, depth) {
  const out = [];
  let i = 0;
  while (i < run.length) {
    const end = tableEnd(run, i);
    if (end > i) {
      out.push({ table: tableRows(run.slice(i, end + 1), gutter.em) });
      i = end + 1;
      continue;
    }
    const piece = [run[i]];
    while (++i < run.length && tableEnd(run, i) === i
      && piece[piece.length - 1].y - run[i].y < Math.max(run[i].size, piece[piece.length - 1].size) * 1.8) piece.push(run[i]);
    out.push(...columns(piece, gutter, depth));
  }
  return out;
}

// The last row of a table starting at run[i] (i itself when none does): rows of two or more short
// segments, plus rows of short text that leave the first column empty (a cell wrapping onto a second line).
function tableEnd(run, i) {
  const short = segs => median(segs.map(s => s.text.trim().length)) <= 25;
  if (run[i].segs.length < 2 || !short(run[i].segs)) return i;
  const firstCol = run[i].segs[0].end;
  let j = i;
  while (j + 1 < run.length && short(run[j + 1].segs) && (run[j + 1].segs.length >= 2 || run[j + 1].x > firstCol)) j++;
  return j;
}

function columns(piece, gutter, depth) {
  const left = [], right = [];
  for (const l of piece) {
    const a = l.segs.filter(s => s.end <= gutter.x), b = l.segs.filter(s => s.x >= gutter.x);
    if (a.length) left.push(makeLine(a, l));
    if (b.length) right.push(makeLine(b, l));
  }
  return left.length < 2 || right.length < 2 ? piece : [...pdfLayout(left, depth + 1), ...pdfLayout(right, depth + 1)];
}

// Columns are the x ranges covered by text in the band; each segment goes in the column it overlaps.
// A row with an empty first cell continues the cells of the row above (text wrapped inside a cell).
function tableRows(run, em) {
  const cols = [];
  for (const s of run.flatMap(l => l.segs).sort((a, b) => a.x - b.x)) {
    const col = cols[cols.length - 1];
    if (col && s.x < col.end + em / 2) col.end = Math.max(col.end, s.end);
    else cols.push({ x: s.x, end: s.end });
  }
  const rows = [];
  for (const line of run) {
    const cells = cols.map(() => '');
    for (const s of line.segs) {
      const i = cols.findIndex(c => s.x < c.end && s.end > c.x);
      cells[i] = (cells[i] + ' ' + s.text.trim()).trim();
    }
    const prev = rows[rows.length - 1];
    if (prev && !cells[0]) cells.forEach((c, i) => { if (c) prev[i] = (prev[i] + ' ' + c).trim(); });
    else rows.push(cells);
  }
  return rows;
}

// Turns lines into Markdown blocks: headings by font size relative to body text, lists, paragraphs, tables.
export function pdfBlocks(lines, body) {
  const blocks = [];
  let para = '';
  let prev = null;
  let itemX = null;
  const flush = () => { if (para) blocks.push(para); para = ''; };
  for (const line of lines) {
    if (line.table) {
      flush();
      blocks.push(mdTable(line.table));
      prev = itemX = null;
      continue;
    }
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
    } else if (prev && !prev.heading && !para && itemX != null && line.x > itemX + line.size * 0.5 && prev.y > line.y && prev.y - line.y < line.size * 1.6) {
      blocks[blocks.length - 1] += ' ' + t; // wrapped list item, indented past its bullet
    } else {
      // Moving back up the page means a new column; an unfinished sentence carries on there.
      const newColumn = prev && prev.y < line.y && !prev.heading;
      if (prev && (prev.y - line.y > line.size * 1.8 || (newColumn && /[.!?:;"”)]$/.test(para)))) flush();
      itemX = null;
      para = !para ? t : /[a-z]-$/.test(para) ? para.slice(0, -1) + t : para + ' ' + t;
    }
    prev = line;
  }
  flush();
  return blocks;
}
