// Turns positioned text (from a PDF page, or words read from a scan) into Markdown: lines, columns,
// tables, headings, lists and paragraphs. Shared by the PDF and OCR converters.
import { mdTable } from './markdown.js';

// Emphasis travels through the layout code as private-use characters around each styled text item,
// so line text and the checks on it stay plain. They become Markdown once the blocks are final.
const B_ON = '\uE000', B_OFF = '\uE001', I_ON = '\uE002', I_OFF = '\uE003';
export const plainText = s => s.replace(/[\uE000-\uE003]/g, '');
const styled = (str, style) => !style || !str.trim() ? str
  : style.bold && style.italic ? B_ON + I_ON + str + I_OFF + B_OFF
  : style.bold ? B_ON + str + B_OFF
  : style.italic ? I_ON + str + I_OFF : str;
export const unbold = l => {
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

// The body text size: the most common size, weighted by the amount of text set in it (tables included).
export function bodySize(lines) {
  const weight = {};
  for (const l of lines) weight[l.size] = (weight[l.size] || 0) + (l.table ? l.chars : l.text.length);
  return +Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
}

// Heading levels follow the document's own sizes: the largest heading text is #, the next ##, and
// so on. Sizes within `tolerance` (5%) of each other share a level.
export function headingLevels(lines, body, tolerance = 0.05) {
  const sizes = [...new Set(lines.filter(l => !l.table && l.size / body >= 1.15 && l.text.trim().length < 120).map(l => l.size))];
  const levels = new Map();
  let level = 0, top = Infinity;
  for (const size of sizes.sort((a, b) => b - a)) {
    if (size < top * (1 - tolerance)) { level++; top = size; }
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
  // Sideways text (such as the arXiv stamp in the margin) is left out, unless most of the page is sideways.
  const sideways = it => Math.abs(it.transform[1]) > Math.abs(it.transform[0]) * 0.05 || Math.abs(it.transform[2]) > Math.abs(it.transform[3]) * 0.05;
  const length = list => list.reduce((sum, it) => sum + it.str.length, 0);
  const upright = items.filter(it => !sideways(it));
  if (length(upright) >= length(items) / 2) items = upright;
  const sorted = items.filter(it => it.str).map(it => ({
    str: it.str, fontName: it.fontName, word: it.word, x: it.transform[4], y: it.transform[5], w: it.width,
    size: Math.round(Math.hypot(it.transform[2], it.transform[3]) * 2) / 2,
  })).sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    // Measured against the smaller text, so a big title doesn't swallow small lines beside it,
    // while a raised footnote mark still joins its line.
    if (row && Math.abs(row.y - it.y) < Math.min(row.size, it.size) * 0.6) {
      row.items.push(it);
      // The line sits on the baseline of its largest text, not on a raised footnote mark.
      if (it.size >= row.size * 1.25) row.y = it.y;
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
      // Words read from a scan can sit further apart than a PDF's, so their cells need a wider gap.
      if (seg && (gap < row.size * (it.word ? 1.6 : 1) || MARKER.test(seg.text.trim()))) {
        if ((it.word || gap > it.size * 0.15) && !/\s$/.test(seg.text) && !/^\s/.test(it.str)) { seg.text += ' '; seg.md += ' '; }
        seg.text += it.str;
        seg.md += md;
        seg.end = Math.max(seg.end, it.x + it.w);
        seg.size = Math.max(seg.size, it.size);
      } else {
        segs.push({ text: it.str, md, x: it.x, end: it.x + it.w, size: it.size });
      }
    }
    return segs.length ? makeLine(segs, row) : null;
  }).filter(Boolean);
}

// A line starting with a bullet: the usual symbols, the private-use glyphs Word's Symbol and Wingdings
// fonts leave in PDFs, and a hyphen or "o" (Word's second-level bullet) followed by a space.
const BULLET = /^(?:[•●▪◦‣∙○■□➢►–\uf0a7\uf0b7\uf076\uf0d8\uf0fc]|[-o](?=\s))\s*/;
const MARKER = /^([•●▪◦‣∙○■□➢►–-]|\d{1,3}[.)])$/;
// A line's size is that of its own segments, so a column's line isn't sized by text beside it.
const makeLine = (segs, { y, size }) => ({
  text: segs.map(s => s.text.trim()).join(' '), md: segs.map(s => s.md.trim()).join(' '), x: segs[0].x, y,
  size: Math.max(...segs.map(s => s.size ?? 0)) || size, end: segs[segs.length - 1].end, segs,
});

// Puts lines in reading order: multi-column text is read column by column, and rows of short cells
// lined up under shared gaps become { table } entries. Tables of three or more columns are found
// first, since their rows can run through a gap that other lines leave between columns, which would
// otherwise cut them apart.
export function pdfLayout(lines, depth = 0) {
  const out = [];
  let rest = [];
  const flushRest = () => { if (rest.length) out.push(...columnLayout(rest, depth)); rest = []; };
  for (let i = 0; i < lines.length; i++) {
    const end = wideTableEnd(lines, i);
    if (end > i) {
      // Rows just above that line up with the table belong to it too, such as a first row with
      // only two cells filled in.
      // A header row, often centred over its columns and wrapping onto a second line, is pulled in
      // as long as its cells overlap the table's columns.
      const rows = lines.slice(i, end + 1);
      let above = rest.length;
      while (above > 0 && rest[above - 1].y - (above < rest.length ? rest[above] : rows[0]).y < rows[0].size * 3) {
        const line = rest[above - 1];
        if (cellRow(line) && linesUp(line, rows, true)) rows.unshift(...rest.splice(above - 1));
        else if (line.segs.length > 2 || line.x <= rows[0].segs[0].end) break;
        above--;
      }
      flushRest();
      out.push(tableEntry(rows, lines[i].size));
      i = end;
    } else rest.push(lines[i]);
  }
  flushRest();
  return out;
}

// A row of a wide table: two or more cells, none longer than a few words' worth or ending in a
// hyphenated break, which is how three narrow columns of prose differ from a table.
const cellRow = l => l.segs.length >= 2 && shortCells(l.segs) && l.segs.every(s => s.text.trim().length <= 35 && !/[a-z]-$/.test(s.text.trim()));
// At least two of the line's cells start or end where cells of the table's rows do (or, for a header,
// overlap them).
const linesUp = (line, rows, overlap = false) => line.segs.filter(s => rows.some(r => r.segs.some(t =>
  Math.abs(t.x - s.x) < line.size || Math.abs(t.end - s.end) < line.size || (overlap && s.x < t.end && s.end > t.x)))).length >= 2;

// The last line of a table of three or more columns starting at lines[i] (i itself when none does):
// further rows lining up with the table's columns, and lines of a cell that wraps (text starting past
// the first column). It needs at least three rows.
function wideTableEnd(lines, i) {
  const head = lines[i];
  if (head.segs.length < 3 || !cellRow(head)) return i;
  const rows = [head];
  let j = i;
  while (j + 1 < lines.length) {
    const next = lines[j + 1];
    if (lines[j].y - next.y > Math.max(lines[j].size, next.size) * 3 || lines[j].y < next.y) break;
    if (cellRow(next) && linesUp(next, rows)) rows.push(next);
    else if (!(next.x > head.segs[0].end && next.segs.length <= 2 && next.segs.every(s => s.text.trim().length <= 60))) break;
    j++;
  }
  return rows.length >= 3 ? j : i;
}

// Lines in reading order across columns (see pdfLayout), once wide tables are out of the way. Full-
// width lines (titles, figures spanning the columns) split the page into bands handled one by one.
function columnLayout(lines, depth) {
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
// Table cells are short (the true median, so a short label beside a longer value counts), and none
// is a run of prose (a column of text beside a figure's labels).
const shortCells = segs => {
  const lengths = segs.map(s => s.text.trim().length);
  if (Math.max(...lengths) > 45) return false;
  // A label and its value, as in a form: "Name:" beside "Universal Studios Distribution".
  if (segs.length === 2 && /:$/.test(segs[0].text.trim()) && lengths[0] <= 30) return true;
  return median(lengths) <= 25;
};
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
      out.push(tableEntry(run.slice(i, end + 1), gutter.em));
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
  if (run[i].segs.length < 2 || !shortCells(run[i].segs)) return i;
  const firstCol = run[i].segs[0].end;
  let j = i, rows = 1;
  while (j + 1 < run.length && shortCells(run[j + 1].segs) && (run[j + 1].segs.length >= 2 || run[j + 1].x > firstCol)) {
    if (run[++j].segs.length >= 2) rows++;
  }
  // One row with cells and lines under it is a line beside a note, such as a title and a date.
  return rows >= 2 ? j : i;
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

// A table built from lines, keeping their usual size and amount of text, which count towards the
// document's body text size like any other text.
const tableEntry = (lines, em) => ({
  table: tableRows(lines, em), size: median(lines.map(l => l.size)), chars: lines.reduce((sum, l) => sum + l.text.length, 0),
});

// Columns are the x ranges covered by the cells of rows with two or more (a lone line of wrapped text
// can be wider than its column); each segment goes in the column it overlaps, or else the one it
// starts in. A row with an empty first cell continues the cells of the row above (text wrapped in a cell).
function tableRows(run, em) {
  const cols = [];
  const rowsWithCells = run.filter(l => l.segs.length >= 2);
  for (const s of (rowsWithCells.length ? rowsWithCells : run).flatMap(l => l.segs).sort((a, b) => a.x - b.x)) {
    const col = cols[cols.length - 1];
    if (col && s.x < col.end + em / 2) col.end = Math.max(col.end, s.end);
    else cols.push({ x: s.x, end: s.end });
  }
  const rows = [];
  for (const line of run) {
    const cells = cols.map(() => '');
    for (const s of line.segs) {
      let i = cols.findIndex(c => s.x < c.end && s.end > c.x);
      if (i < 0) i = Math.max(0, cols.findLastIndex(c => c.x <= s.x));
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

// A line drawn with one repeated character, such as ===== or -----, used as a divider.
const RULE = /^([=\-_~*.·])(\s?\1){4,}$/;
// Runs of dots leading to a page number, as in a table of contents.
const LEADER = /(\s?\.){4,}\s?/g;
// Dividers stuck to text, as in "_______Page 1".
const stripRules = s => s.replace(/^([=_])\1{4,}\s*|\s*([=_])\2{4,}$/g, '');

// The usual distance between neighbouring lines of body text, so paragraph gaps can be told from
// ordinary line spacing whatever the document's spacing is.
function linePitch(lines, body) {
  const gaps = [];
  for (let i = 1; i < lines.length; i++) {
    const [a, b] = [lines[i - 1], lines[i]];
    if (a.table || b.table || Math.abs(a.size - body) > 0.6 || Math.abs(b.size - body) > 0.6) continue;
    if (a.y - b.y > body * 0.8 && a.y - b.y < body * 2.5) gaps.push(a.y - b.y);
  }
  // The lower quartile, since a page of short paragraphs can have more paragraph gaps than line gaps.
  return gaps.length >= 3 ? gaps.sort((a, b) => a - b)[gaps.length >> 2] : body * 1.2;
}

// Groups lines into blocks: neighbouring lines in reading order that start at the same place in the
// same size (dividers such as ===== join whatever their size), with no big gap between them. For each
// line it gives the block's right edge, and whether the block is prose. In prose most lines that run
// on to the next one reach the edge; in receipts, forms and lists of names they stop short.
function textBlocks(lines, pitch) {
  const info = new Map();
  let block = [];
  const close = () => {
    const edge = Math.max(...block.map(l => l.end));
    const left = Math.min(...block.map(l => l.x));
    const runOn = block.filter((l, i) => i < block.length - 1 && !RULE.test(l.text.trim()) && l.y - block[i + 1].y <= pitch * 1.3);
    const full = runOn.filter(l => edge - l.end < (edge - left) * 0.15);
    const meta = { edge, prose: runOn.length < 2 || full.length >= runOn.length / 2 };
    for (const l of block) info.set(l, meta);
    block = [];
  };
  for (const line of lines) {
    if (line.table) { if (block.length) close(); continue; }
    const last = block[block.length - 1];
    const sameSize = last && (Math.abs(last.size - line.size) < 1 || RULE.test(last.text.trim()) || RULE.test(line.text.trim()));
    if (last && !(sameSize && Math.abs(last.x - line.x) < line.size * 2 && last.y - line.y > 0 && last.y - line.y < pitch * 2.5)) close();
    block.push(line);
  }
  if (block.length) close();
  return info;
}

// Turns lines into Markdown blocks: headings by font size relative to body text, lists, paragraphs,
// tables. Heading levels come from headingLevels unless given.
export function pdfBlocks(lines, body, levels = headingLevels(lines, body)) {
  const blocks = [];
  let para = '';
  let paraLines = 0;
  let prev = null;
  let itemX = null;
  // Open list items, outermost first, for nesting: { x, width } where width is the marker's length.
  let items = [];
  const flush = () => { if (para) blocks.push(para); para = ''; paraLines = 0; };
  const pitch = linePitch(lines, body);
  const spacing = line => Math.abs(line.size - body) <= 0.6 ? pitch : line.size * 1.2;
  const blocksOf = textBlocks(lines, pitch);
  // A line ends on purpose when the next line's first word would have fit after it, or, in a block
  // that isn't prose, unless it runs almost to the edge (a long line that had to wrap).
  const endsEarly = (a, b) => {
    const block = blocksOf.get(a);
    if (a.end == null || !block || /-$/.test(a.text.trim())) return false;
    const room = block.edge - a.end;
    const charWidth = (a.end - a.x) / Math.max(a.text.length, 1);
    const fits = room > (b.text.trim().split(/\s/)[0].length + 1) * charWidth;
    if (!block.prose && blocksOf.get(b) === block) return fits || room > (block.edge - a.x) * 0.15;
    return fits;
  };
  // Lines centred on one axis but starting at different points, as in an address block.
  const centred = (a, b) => Math.abs((a.x + a.end) / 2 - (b.x + b.end) / 2) < b.size && Math.abs(a.x - b.x) > b.size / 2 && Math.abs(a.end - b.end) > b.size / 2;
  // Lines that each start with a short label, as in "Report ID: …" followed by "Warehouse: …".
  const labelled = l => /^[^\s:][^:]{0,30}:(\s|$)/.test(l.text.trim()) && l.text.trim().split(':')[0].split(' ').length <= 4;
  for (const line of lines) {
    if (line.table) {
      flush();
      // A form's two columns of labels and values reads better as "Label: value" lines than as a
      // table whose first row would pose as a header.
      const rows = line.table;
      const form = rows.length >= 2 && rows.every(r => r.length === 2 && /:$/.test(plainText(r[0]).trim()));
      // When the cells all fell into one column there is no table to show, just its lines.
      if (rows.every(r => r.length === 1)) blocks.push(...rows.map(r => r[0]).filter(Boolean));
      else blocks.push(...(form ? rows.map(([label, value]) => `${plainText(label)} ${value}`.trim()) : [mdTable(rows)]));
      prev = itemX = null;
      items = [];
      continue;
    }
    let t = line.text.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (RULE.test(t)) {
      flush();
      if (blocks[blocks.length - 1] !== '---') blocks.push('---');
      prev = itemX = null;
      items = [];
      continue;
    }
    let md = tidy(line.md ?? line.text);
    t = stripRules(t).replace(LEADER, ' ... ');
    md = stripRules(md).replace(LEADER, ' ... ');
    if (!t) continue;
    const ratio = line.size / body;
    const bullet = t.match(BULLET);
    const numbered = t.match(/^(\d{1,3})[.)]\s+/);
    if (ratio >= 1.15 && t.length < 120 && !t.includes(' ... ')) {
      flush();
      itemX = null;
      items = [];
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
      // An item further right than an open one sits under it, indented by that item's marker.
      // Only an item just below and a little to the right nests; one back up the page is in a new column.
      if (prev && (prev.y < line.y || prev.y - line.y > spacing(line) * 1.6)) items = [];
      while (items.length && (items[items.length - 1].x >= line.x - line.size * 0.5 || line.x - items[items.length - 1].x > line.size * 4)) items.pop();
      const marker = bullet ? '- ' : `${numbered[1]}. `;
      blocks.push(' '.repeat(items.reduce((sum, it) => sum + it.width, 0)) + marker + rest);
      items.push({ x: line.x, width: marker.length });
      itemX = line.x;
    } else if (prev && !prev.heading && !para && itemX != null && prev.y > line.y && prev.y - line.y < spacing(line) * 1.3
      && (line.x > itemX + line.size * 0.5 || !endsEarly(prev, line))) {
      // A wrapped list item: indented past its bullet, or carrying on from a line that ran to the edge.
      const last = blocks[blocks.length - 1];
      blocks[blocks.length - 1] = /[a-z]-$/.test(plainText(last)) ? unhyphen(last) + md : last + ' ' + md;
    } else {
      // Moving back up the page means a new column; an unfinished sentence carries on there.
      const newColumn = prev && prev.y < line.y && !prev.heading;
      const gap = prev ? prev.y - line.y : 0;
      const breaks = prev && !newColumn && (
        gap > spacing(line) * 1.3 // a paragraph gap
        || (!prev.heading && endsEarly(prev, line)) // a line that stops short on purpose
        || centred(prev, line)
        || (labelled(prev) && labelled(line))
        || (paraLines >= 2 && line.x - prev.x > line.size * 0.8 && line.x - prev.x < line.size * 4)); // an indented first line
      if (breaks || (newColumn && /[.!?:;"”)]$/.test(plainText(para)))) flush();
      itemX = null;
      items = [];
      para = !para ? md : /[a-z]-$/.test(plainText(para)) ? unhyphen(para) + md : para + ' ' + md;
      paraLines++;
    }
    prev = line;
  }
  flush();
  return blocks;
}
