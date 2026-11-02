import JSZip from 'jszip';
import mammoth from 'mammoth/mammoth.browser.js';
import { htmlToMd } from './html.js';
import { parseHtml, parseXml } from './markdown.js';

// Placeholders that stand in for equations while Mammoth and Turndown run: private-use characters,
// which neither changes or escapes.
const [OPEN, CLOSE] = [String.fromCharCode(0xe010), String.fromCharCode(0xe011)];

export async function docxToMd(file, ctx) {
  ctx.progress('Reading document…');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const equations = [];
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (docXml?.includes('<m:oMath')) {
    const { ommlToLatex } = await import('./omml.js');
    zip.file('word/document.xml', replaceEquations(docXml, ommlToLatex, equations));
  }
  const { value } = await mammoth.convertToHtml(
    { arrayBuffer: await zip.generateAsync({ type: 'arraybuffer' }) },
    { styleMap: await headingMap(zip, docXml ?? '') },
  );
  // An equation on its own line ($$) or within text ($).
  return htmlToMd(parseHtml(value).body).replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g'), (_, i) => {
    const { latex, display } = equations[i];
    return display ? `$$${latex}$$` : `$${latex}$`;
  });
}

// Each equation becomes a placeholder run holding its number in `equations`.
function replaceEquations(xml, toLatex, equations) {
  const doc = parseXml(xml);
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const maths = [...doc.getElementsByTagName('m:oMath')].filter(m => m.parentNode.localName !== 'oMathPara')
    .concat([...doc.getElementsByTagName('m:oMathPara')]);
  for (const math of maths) {
    const display = math.localName === 'oMathPara';
    const latex = (display ? [...math.getElementsByTagName('m:oMath')] : [math]).map(toLatex).join(' \\\\ ');
    const run = doc.createElementNS(W, 'w:r');
    const t = doc.createElementNS(W, 'w:t');
    t.textContent = OPEN + equations.length + CLOSE;
    run.append(t);
    math.replaceWith(run);
    equations.push({ latex, display });
  }
  return new XMLSerializer().serializeToString(doc);
}

// Word's headings, plus its Title style. When the document uses Title, that becomes # and the
// headings move down a level, so "Heading 1" sections sit under the title.
async function headingMap(zip, docXml) {
  const styles = await zip.file('word/styles.xml')?.async('string') ?? '';
  const titleIds = [...styles.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>\s*<w:name w:val="Title"/g)].map(m => m[1]);
  const hasTitle = titleIds.some(id => docXml.includes(`<w:pStyle w:val="${id}"/>`));
  if (!hasTitle) return [];
  return [
    "p[style-name='Title'] => h1:fresh",
    ...[1, 2, 3, 4, 5].map(n => `p[style-name='Heading ${n}'] => h${n + 1}:fresh`),
  ];
}
