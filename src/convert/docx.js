import mammoth from 'mammoth/mammoth.browser.js';
import { htmlToMd } from './html.js';
import { parseHtml } from './markdown.js';

export async function docxToMd(file, ctx) {
  ctx.progress('Reading document…');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return htmlToMd(parseHtml(value).body);
}
