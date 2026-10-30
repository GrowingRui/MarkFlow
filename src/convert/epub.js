import { fail } from './errors.js';
import { htmlToMd } from './html.js';
import { parseHtml, parseXml } from './markdown.js';
import { openZip } from './zip.js';

export async function epubToMd(file, ctx) {
  ctx.progress('Reading book…');
  const zip = await openZip(file);
  const read = p => zip.file(p)?.async('string');
  const container = parseXml(await read('META-INF/container.xml'));
  const opfPath = container.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw fail('This EPUB is missing its table of contents.');
  const opf = parseXml(await read(opfPath));
  const base = opfPath.split('/').slice(0, -1);
  const resolve = href => {
    const parts = [...base];
    for (const seg of decodeURIComponent(href.split('#')[0]).split('/')) seg === '..' ? parts.pop() : seg !== '.' && parts.push(seg);
    return parts.join('/');
  };
  const manifest = Object.fromEntries([...opf.getElementsByTagName('item')].map(it => [it.getAttribute('id'), it.getAttribute('href')]));
  const chapters = [];
  for (const ref of opf.getElementsByTagName('itemref')) {
    const href = manifest[ref.getAttribute('idref')];
    const html = href && await read(resolve(href));
    if (html) chapters.push(htmlToMd(parseHtml(html).body));
  }
  return chapters.filter(c => c.trim()).join('\n\n');
}
