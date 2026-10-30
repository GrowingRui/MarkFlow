import { joinBlocks, mdTable, parseXml } from './markdown.js';
import { openZip } from './zip.js';

const FOOTER_TYPES = ['dt', 'ftr', 'sldNum'];

export async function pptxToMd(file, ctx) {
  ctx.progress('Reading slides…');
  const zip = await openZip(file);
  const slideNum = p => +p.match(/slide(\d+)\.xml$/)[1];
  const paths = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => slideNum(a) - slideNum(b));
  const textOf = el => [...el.getElementsByTagName('a:t')].map(t => t.textContent).join('');
  const out = [];
  for (const [i, path] of paths.entries()) {
    const doc = parseXml(await zip.file(path).async('string'));
    let title = '';
    const body = [];
    const walk = node => {
      for (const el of node.children) {
        if (el.localName === 'grpSp') walk(el);
        else if (el.localName === 'graphicFrame') {
          const rows = [...el.getElementsByTagName('a:tr')].map(tr => [...tr.getElementsByTagName('a:tc')].map(tc => [...tc.getElementsByTagName('a:p')].map(textOf).join(' ')));
          if (rows.length) body.push(mdTable(rows));
        } else if (el.localName === 'sp') {
          const ph = el.getElementsByTagName('p:ph')[0];
          const type = ph?.getAttribute('type');
          const paras = [...el.getElementsByTagName('a:p')].map(p => ({ text: textOf(p).trim(), lvl: +(p.getElementsByTagName('a:pPr')[0]?.getAttribute('lvl') || 0) })).filter(p => p.text);
          if (!paras.length) continue;
          if ((type === 'title' || type === 'ctrTitle') && !title) title = paras.map(p => p.text).join(' ');
          else if (ph && type !== 'subTitle' && type !== 'title' && type !== 'ctrTitle' && !FOOTER_TYPES.includes(type)) body.push(...paras.map(p => '  '.repeat(p.lvl) + '- ' + p.text));
          else if (!FOOTER_TYPES.includes(type)) body.push(...paras.map(p => p.text));
        }
      }
    };
    const tree = doc.getElementsByTagName('p:spTree')[0];
    if (tree) walk(tree);
    out.push(joinBlocks([`## ${title || `Slide ${i + 1}`}`, ...body]));
  }
  return out.join('\n\n');
}
