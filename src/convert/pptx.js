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
  for (const [i, path] of paths.entries()) {
    const { title, body } = slideToMd(parseXml(await zip.file(path).async('string')));
    out.push(joinBlocks([`## ${title || `Slide ${i + 1}`}`, ...body]));
  }
  return out.join('\n\n');
}

const textOf = el => [...el.getElementsByTagName('a:t')].map(t => t.textContent).join('');
const child = (el, name) => [...el.children].find(c => c.tagName === name);

// One slide: its title and Markdown blocks, in the order the shapes appear.
export function slideToMd(doc) {
  const shapes = [];
  const walk = node => {
    for (const el of node.children) {
      if (el.localName === 'grpSp') walk(el);
      else if (el.localName === 'graphicFrame') {
        const rows = [...el.getElementsByTagName('a:tr')].map(tr => [...tr.getElementsByTagName('a:tc')].map(tc => [...tc.getElementsByTagName('a:p')].map(textOf).join(' ')));
        if (rows.length) shapes.push({ table: mdTable(rows) });
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
    if (s.table) body.push(s.table);
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
