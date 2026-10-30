// Markdown building blocks shared by the converters.

export function fence(lang, text) {
  const ticks = '`'.repeat(Math.max(3, ...[...text.matchAll(/`{3,}/g)].map(m => m[0].length + 1)));
  return `${ticks}${lang}\n${text.replace(/\n+$/, '')}\n${ticks}`;
}

export function mdTable(rows) {
  rows = rows.filter(r => r.some(c => String(c).trim()));
  if (!rows.length) return '';
  const width = Math.max(...rows.map(r => r.length));
  const cell = c => String(c ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
  const line = r => '| ' + Array.from({ length: width }, (_, i) => cell(r[i])).join(' | ') + ' |';
  return [line(rows[0]), '|' + ' --- |'.repeat(width), ...rows.slice(1).map(line)].join('\n');
}

// Blank line between blocks, except between consecutive list items.
export function joinBlocks(blocks) {
  const isItem = b => /^(\s*[-*] |\s*\d+\. )/.test(b);
  return blocks.reduce((out, b, i) => out + (i === 0 ? '' : isItem(b) && isItem(blocks[i - 1]) ? '\n' : '\n\n') + b, '');
}

export const parseHtml = text => new DOMParser().parseFromString(text, 'text/html');
export const parseXml = text => new DOMParser().parseFromString(text, 'application/xml');
