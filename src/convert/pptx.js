import { joinBlocks, mdTable, parseXml } from './markdown.js';
import { openZip } from './zip.js';

const FOOTER_TYPES = ['dt', 'ftr', 'sldNum'];
const TITLE_TYPES = ['title', 'ctrTitle'];

export async function pptxToMd(file, ctx) {
  ctx.progress('Reading slides…');
  const zip = await openZip(file);
  const slideNum = p => +p.match(/slide(\d+)\.xml$/)[1];
  const paths = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => slideNum(a) - slideNum(b));
  const out = [];
  for (const path of paths) {
    const parts = await relatedParts(zip, path);
    const charts = new Map();
    for (const [id, { type, xml }] of parts) if (type === 'chart') charts.set(id, chartToMd(parseXml(xml)));
    // A slide without a title gets no made-up heading, and an empty slide adds nothing.
    const { title, body } = slideToMd(parseXml(await zip.file(path).async('string')), charts);
    const notes = [...parts.values()].find(p => p.type === 'notesSlide');
    const noteText = notes ? notesText(parseXml(notes.xml)) : '';
    const blocks = [...(title ? [`## ${title}`] : []), ...body, ...(noteText ? ['### Notes', noteText] : [])];
    if (blocks.length) out.push(joinBlocks(blocks));
  }
  return out.join('\n\n');
}

// The parts a slide links to (charts, speaker notes), by relationship id: { type, xml }.
async function relatedParts(zip, slidePath) {
  const relsPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
  const rels = await zip.file(relsPath)?.async('string');
  const parts = new Map();
  if (!rels) return parts;
  for (const rel of parseXml(rels).getElementsByTagName('Relationship')) {
    const type = rel.getAttribute('Type')?.split('/').pop();
    if (type !== 'chart' && type !== 'notesSlide') continue;
    // Targets are relative to the slides folder, such as ../charts/chart1.xml.
    const target = new URL(rel.getAttribute('Target'), 'file:///ppt/slides/').pathname.slice(1);
    const xml = await zip.file(target)?.async('string');
    if (xml) parts.set(rel.getAttribute('Id'), { type, xml });
  }
  return parts;
}

// Speaker notes: the text of the notes page's body placeholder, one paragraph per line.
function notesText(doc) {
  const body = [...doc.getElementsByTagName('p:sp')].find(sp => sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') === 'body');
  return body ? [...body.getElementsByTagName('a:p')].map(textOf).map(t => t.trim()).filter(Boolean).join('\n\n') : '';
}

// A chart as its title and a table of the data saved with it: a row per category, a column per series.
export function chartToMd(doc) {
  const values = el => {
    const pts = el ? [...el.getElementsByTagName('c:pt')] : [];
    const out = [];
    for (const pt of pts) out[+pt.getAttribute('idx')] = pt.getElementsByTagName('c:v')[0]?.textContent ?? '';
    return out;
  };
  const series = [...doc.getElementsByTagName('c:ser')].map(ser => {
    const part = name => [...ser.children].find(c => c.localName === name);
    const tx = part('tx');
    return {
      // A series name is a cached cell value, or typed-in rich text.
      name: tx ? values(tx)[0] || textOf(tx) : '',
      categories: values(part('cat') ?? part('xVal')),
      values: values(part('val') ?? part('yVal')),
    };
  });
  const titleEl = doc.getElementsByTagName('c:title')[0];
  const title = titleEl ? textOf(titleEl).trim() : '';
  const blocks = [title ? `### Chart: ${title}` : '### Chart'];
  if (series.length) {
    const count = Math.max(...series.map(s => Math.max(s.categories.length, s.values.length)));
    const categories = series.find(s => s.categories.length)?.categories ?? [];
    const rows = [['Category', ...series.map((s, i) => s.name || `Series ${i + 1}`)]];
    for (let i = 0; i < count; i++) rows.push([categories[i] ?? String(i + 1), ...series.map(s => s.values[i] ?? '')]);
    blocks.push(mdTable(rows));
  }
  return joinBlocks(blocks);
}

const textOf = el => [...el.getElementsByTagName('a:t')].map(t => t.textContent).join('');
const child = (el, name) => [...el.children].find(c => c.tagName === name);

// One slide: its title and Markdown blocks, in the order the shapes appear. `charts` holds each
// chart's Markdown by the relationship id the slide uses for it.
export function slideToMd(doc, charts = new Map()) {
  const shapes = [];
  const walk = node => {
    for (const el of node.children) {
      if (el.localName === 'grpSp') walk(el);
      else if (el.localName === 'graphicFrame') {
        const rows = [...el.getElementsByTagName('a:tr')].map(tr => [...tr.getElementsByTagName('a:tc')].map(tc => [...tc.getElementsByTagName('a:p')].map(textOf).join(' ')));
        const chart = el.getElementsByTagName('c:chart')[0];
        if (rows.length) shapes.push({ block: mdTable(rows) });
        else if (chart && charts.has(chart.getAttribute('r:id'))) shapes.push({ block: charts.get(chart.getAttribute('r:id')) });
      } else if (el.localName === 'pic') {
        // A picture adds its description (alt text), if it has one.
        const descr = el.getElementsByTagName('p:cNvPr')[0]?.getAttribute('descr')?.trim();
        if (descr) shapes.push({ block: `*[Image: ${descr.replace(/\s+/g, ' ')}]*` });
      } else if (el.localName === 'sp') {
        const ph = el.getElementsByTagName('p:ph')[0];
        const type = ph ? ph.getAttribute('type') || 'body' : null;
        if (FOOTER_TYPES.includes(type)) continue;
        const paras = [...el.getElementsByTagName('a:p')].map(paragraph).filter(p => p.text);
        const off = el.getElementsByTagName('a:off')[0];
        if (paras.length) shapes.push({ type, paras, y: +(off?.getAttribute('y') ?? Infinity), size: Math.max(0, ...paras.map(p => p.size)) });
      }
    }
  };
  const tree = doc.getElementsByTagName('p:spTree')[0];
  if (tree) walk(tree);

  // The title placeholder, or failing that a text box that looks like a title (see titleBox).
  const titleShape = shapes.find(s => TITLE_TYPES.includes(s.type)) || titleBox(shapes);
  const body = [];
  for (const s of shapes) {
    if (s === titleShape) continue;
    if (s.block) body.push(s.block);
    // Subtitles and other title placeholders are plain text; body placeholders are bulleted by default.
    else body.push(...listBlocks(s.paras, s.type && !TITLE_TYPES.includes(s.type) && s.type !== 'subTitle'));
  }
  return { title: titleShape?.paras.map(p => p.text).join(' ') ?? '', body };
}

// A slide without a title placeholder: the topmost text box, if it is one short unbulleted line
// and nothing on the slide is set in larger type; otherwise the one such line set in the largest type.
function titleBox(shapes) {
  const boxes = shapes.filter(s => s.paras && !s.type);
  if (!boxes.length) return null;
  const isTitle = s => s.paras.length === 1 && !['char', 'num'].includes(s.paras[0].bullet) && s.paras[0].text.length <= 100;
  const largest = Math.max(...shapes.filter(s => s.paras).map(s => s.size));
  const top = boxes.reduce((a, b) => (b.y < a.y ? b : a));
  if (isTitle(top) && top.size >= largest) return top;
  const big = boxes.filter(s => isTitle(s) && s.size === largest && largest > 0);
  return big.length === 1 ? big[0] : null;
}

function paragraph(p) {
  const pPr = child(p, 'a:pPr');
  const marker = pPr && [...pPr.children].find(c => ['a:buChar', 'a:buAutoNum', 'a:buNone', 'a:buBlip'].includes(c.tagName));
  const sizes = [...p.getElementsByTagName('a:rPr')].map(r => +r.getAttribute('sz') || 0);
  return {
    text: textOf(p).trim(),
    lvl: +(pPr?.getAttribute('lvl') || 0),
    // 'num', 'char', 'none', or undefined when the paragraph inherits its bullet from the layout.
    bullet: { 'a:buAutoNum': 'num', 'a:buNone': 'none' }[marker?.tagName] ?? (marker ? 'char' : undefined),
    size: Math.max(0, ...sizes),
  };
}

// Paragraphs to blocks. List items nest by level, indented under the text of their parent item
// (two spaces under "- ", three under "1. ") so Markdown renderers keep the nesting.
function listBlocks(paras, bulletedByDefault) {
  const blocks = [];
  let stack = []; // per level: { indent, number }
  for (const p of paras) {
    const isItem = p.bullet === 'char' || p.bullet === 'num' || (p.bullet === undefined && bulletedByDefault);
    if (!isItem) {
      blocks.push(p.text);
      stack = [];
      continue;
    }
    const lvl = Math.min(p.lvl, stack.length);
    stack = stack.slice(0, lvl + 1);
    const parent = stack[lvl - 1];
    const indent = parent ? parent.indent + ' '.repeat(parent.marker.length) : '';
    const number = p.bullet === 'num' ? (stack[lvl]?.number ?? 0) + 1 : 0;
    const marker = p.bullet === 'num' ? `${number}. ` : '- ';
    stack[lvl] = { indent, number, marker };
    blocks.push(indent + marker + p.text);
  }
  return blocks;
}
