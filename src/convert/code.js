// Formats that become code blocks, in whole or in part.
import { fence } from './markdown.js';

export async function jsonToMd(file) {
  const text = await file.text();
  try { return fence('json', JSON.stringify(JSON.parse(text), null, 2)); }
  catch { return fence('json', text); }
}

export async function xmlToMd(file) {
  return fence('xml', (await file.text()).trim());
}

export async function ipynbToMd(file) {
  const nb = JSON.parse(await file.text());
  const lang = nb.metadata?.kernelspec?.language || nb.metadata?.language_info?.name || '';
  const src = s => Array.isArray(s) ? s.join('') : (s || '');
  const blocks = [];
  for (const cell of nb.cells || []) {
    const body = src(cell.source).trim();
    if (cell.cell_type === 'markdown' && body) blocks.push(body);
    else if (cell.cell_type === 'code') {
      if (body) blocks.push(fence(lang, body));
      for (const out of cell.outputs || []) {
        const data = out.data || {};
        if (out.output_type === 'stream') blocks.push(fence('text', src(out.text)));
        else if (data['text/markdown']) blocks.push(src(data['text/markdown']));
        else if (data['text/plain']) blocks.push(fence('text', src(data['text/plain'])));
      }
    } else if (body) blocks.push(fence('', body));
  }
  return blocks.join('\n\n');
}
