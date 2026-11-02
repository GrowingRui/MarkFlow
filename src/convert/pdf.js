import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadModule } from './errors.js';
import { joinBlocks, mdTable } from './markdown.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function pdfToMd(file, ctx) {
  ctx.progress('Opening PDF…');
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  let textChars = 0, boldChars = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.progress(`Reading page ${n} of ${doc.numPages}…`);
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const chars = items.reduce((sum, it) => sum + it.str.trim().length, 0);
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
      const styles = await fontStyles(page, items);
      for (const it of items) {
        textChars += it.str.length;
        if (styles[it.fontName]?.bold) boldChars += it.str.length;
      }
      const [, bottom, , top] = page.view;
      pages.push({ lines: pdfLines(items, styles), bottom, top });
    }
    page.cleanup();
  }
  // In a document set mostly in bold, bold says nothing, so it is left out.
  if (boldChars > textChars / 2) for (const p of pages) for (const l of p.lines || []) unbold(l);
  dropRunningLines(pages.filter(p => p.lines));
  for (const p of pages) if (p.lines) p.lines = pdfLayout(p.lines);
  // The most common font size (weighted by text length) is treated as body text.
  const weight = {};
  for (const p of pages) for (const l of p.lines || []) if (!l.table) weight[l.size] = (weight[l.size] || 0) + l.text.length;
  const body = +Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
  const levels = headingLevels(pages.flatMap(p => p.lines || []), body);
  const blocks = joinPages(pages.map(p => p.ocr != null ? (p.ocr ? [p.ocr] : []) : pdfBlocks(p.lines, body, levels)));
  return joinBlocks(blocks.map(renderEmphasis));
}

// Bold and italic come from the font's name, such as "ABCDEF+Calibri-BoldItalic". PDF.js reports
// names only for fonts it has loaded to draw the page, so the page's drawing operations are read
// first. A font that never arrives counts as plain, and so does every font when the page can't be read.
async function fontStyles(page, items) {
  try {
    await page.getOperatorList();
  } catch {
    return {};
  }
  const styles = {};
  for (const id of new Set(items.map(it => it.fontName))) {
    const font = await Promise.race([new Promise(done => page.commonObjs.get(id, done)), new Promise(done => setTimeout(done, 1000))]);
    const name = typeof font?.name === 'string' ? font.name.replace(/^[A-Z]{6}\+/, '') : '';
    styles[id] = {
      bold: !!(font?.bold || font?.black) || /bold|black|heavy|semibold|demi/i.test(name),
      italic: !!font?.italic || /italic|oblique/i.test(name),
    };
  }
  return styles;
}

// Emphasis travels through the layout code as private-use characters around each styled text item,
// so line text and the checks on it stay plain. They become Markdown once the blocks are final.
const B_ON = '\uE000', B_OFF = '\uE001', I_ON = '\uE002', I_OFF = '\uE003';
export const plainText = s => s.replace(/[\uE000-\uE003]/g, '');
const styled = (str, style) => !style || !str.trim() ? str
  : style.bold && style.italic ? B_ON + I_ON + str + I_OFF + B_OFF
  : style.bold ? B_ON + str + B_OFF
  : style.italic ? I_ON + str + I_OFF : str;
const unbold = l => {
  l.md = l.md.replace(/[\uE000\uE001]/g, '');
  for (const s of l.segs) s.md = s.md.replace(/[\uE000\uE001]/g, '');
};

// Moves spaces outside the marks, where Markdown needs them: "*a *" becomes "*a* ".
function outward(md) {
  for (let prev; prev !== md;) {
    prev = md;
    md = md.replace(/([\uE000\uE002])([^\S\n]+)/g, '$2$1').replace(/([^\S\n]+)([\uE001\uE003])/g, '$2$1');
  }
  return md;
}
// Collapses spaces like line text does, so the plain text of the result matches it.
const tidy = md => outward(md).replace(/\s+/g, ' ').trim();

// Neighbouring runs of one style merge, so a bold phrase spread over several text items or a line
// break becomes one **phrase**.
export function renderEmphasis(text) {
  const merged = text.replace(/\uE001([^\S\n]*)\uE000/g, '$1').replace(/\uE003([^\S\n]*)\uE002/g, '$1');
  return outward(merged).replace(/\uE000\uE001|\uE002\uE003/g, '').replace(/[\uE000\uE001]/g, '**').replace(/[\uE002\uE003]/g, '*');
}

// Heading levels follow the document's own sizes: the largest heading text is #, the next ##, and
// so on. Sizes within 5% of each other share a level.
export function headingLevels(lines, body) {
  const sizes = [...new Set(lines.filter(l => !l.table && l.size / body >= 1.15 && l.text.trim().length < 120).map(l => l.size))];
  const levels = new Map();
  let level = 0, top = Infinity;
  for (const size of sizes.sort((a, b) => b - a)) {
    if (size < top * 0.95) { level++; top = size; }
    levels.set(size, Math.min(level, 6));
  }
  return levels;
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
  const isPara = b => b && !/^(#|- |\d+\. |\||```)/.test(b) && !b.includes('\n');
  const out = [];
  for (const blocks of pages) {
    const last = out[out.length - 1];
    const lastText = last && plainText(last);
    if (isPara(last) && lastText.length > 40 && !/[.!?:;"”)]$/.test(lastText) && isPara(blocks[0])) {
      out[out.length - 1] = /[a-z]-$/.test(lastText) && /^[a-z]/.test(plainText(blocks[0])) ? unhyphen(last) + blocks[0] : last + ' ' + blocks[0];
      out.push(...blocks.slice(1));
    } else {
      out.push(...blocks);
    }
  }
  return out;
}

// Groups PDF.js text items into lines, top to bottom. Within a line, text separated by a gap of
// a character or more becomes its own segment, so columns and table cells can be told apart later.
// Each segment and line also keeps an `md` copy of its text with the emphasis marks from `styles`.
export function pdfLines(items, styles = {}) {
  const rows = [];
  const sorted = items.filter(it => it.str).map(it => ({
    str: it.str, fontName: it.fontName, x: it.transform[4], y: it.transform[5], w: it.width,
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
        if (seg && !/\s$/.test(seg.text)) { seg.text += ' '; seg.md += ' '; }
        continue;
      }
      const gap = seg ? it.x - seg.end : 0;
      const md = styled(it.str, styles[it.fontName]);
      // A lone bullet or number stays with its text however far apart they are.
      if (seg && (gap < row.size || MARKER.test(seg.text.trim()))) {
        if (gap > it.size * 0.15 && !/\s$/.test(seg.text) && !/^\s/.test(it.str)) { seg.text += ' '; seg.md += ' '; }
        seg.text += it.str;
        seg.md += md;
        seg.end = Math.max(seg.end, it.x + it.w);
      } else {
        segs.push({ text: it.str, md, x: it.x, end: it.x + it.w });
      }
    }
    return segs.length ? makeLine(segs, row) : null;
  }).filter(Boolean);
}

const MARKER = /^([•●▪◦‣∙○■□➢►–-]|\d{1,3}[.)])$/;
const makeLine = (segs, { y, size }) => ({
  text: segs.map(s => s.text.trim()).join(' '), md: segs.map(s => s.md.trim()).join(' '), x: segs[0].x, y, size, end: segs[segs.length - 1].end, segs,
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
      cells[i] = (cells[i] + ' ' + s.md.trim()).trim();
    }
    const prev = rows[rows.length - 1];
    if (prev && !cells[0]) cells.forEach((c, i) => { if (c) prev[i] = (prev[i] + ' ' + c).trim(); });
    else rows.push(cells);
  }
  // A Markdown header row already stands out, so bold there is dropped.
  if (rows.length) rows[0] = rows[0].map(plainText);
  return rows;
}

// Drops the first n characters of text, keeping any emphasis marks among them.
const dropChars = (md, n) => md.replace(/[^\uE000-\uE003]/g, c => n-- > 0 ? '' : c);
// Removes the hyphen at the end of a line, which may be followed by emphasis marks.
const unhyphen = md => md.replace(/-([\uE000-\uE003]*)$/, '$1');

// Turns lines into Markdown blocks: headings by font size relative to body text, lists, paragraphs,
// tables. Heading levels come from headingLevels unless given.
export function pdfBlocks(lines, body, levels = headingLevels(lines, body)) {
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
    const md = tidy(line.md ?? line.text);
    const ratio = line.size / body;
    const bullet = t.match(/^[•●▪◦‣∙○■□➢►–]\s*/);
    const numbered = t.match(/^(\d{1,3})[.)]\s+/);
    if (ratio >= 1.15 && t.length < 120) {
      flush();
      itemX = null;
      const level = levels.get(line.size) ?? 3;
      // Consecutive heading lines of the same size are one wrapped heading.
      const last = blocks[blocks.length - 1];
      if (prev?.heading === level && last?.startsWith('#'.repeat(level) + ' ')) blocks[blocks.length - 1] += ' ' + t;
      else blocks.push('#'.repeat(level) + ' ' + t);
      prev = { ...line, heading: level };
      continue;
    }
    if (bullet || numbered) {
      flush();
      const rest = dropChars(md, (bullet || numbered)[0].length);
      blocks.push(bullet ? `- ${rest}` : `${numbered[1]}. ${rest}`);
      itemX = line.x;
    } else if (prev && !prev.heading && !para && itemX != null && line.x > itemX + line.size * 0.5 && prev.y > line.y && prev.y - line.y < line.size * 1.6) {
      blocks[blocks.length - 1] += ' ' + md; // wrapped list item, indented past its bullet
    } else {
      // Moving back up the page means a new column; an unfinished sentence carries on there.
      const newColumn = prev && prev.y < line.y && !prev.heading;
      if (prev && (prev.y - line.y > line.size * 1.8 || (newColumn && /[.!?:;"”)]$/.test(plainText(para))))) flush();
      itemX = null;
      para = !para ? md : /[a-z]-$/.test(plainText(para)) ? unhyphen(para) + md : para + ' ' + md;
    }
    prev = line;
  }
  flush();
  return blocks;
}
