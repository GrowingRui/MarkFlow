import TurndownService from 'turndown';
import { mdTable, parseHtml } from './markdown.js';

let turndown;
function service() {
  if (turndown) return turndown;
  turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
  turndown.remove(['script', 'style', 'noscript', 'iframe', 'template']);
  turndown.addRule('table', {
    filter: 'table',
    replacement: (_, node) => '\n\n' + mdTable([...node.rows].map(r => [...r.cells].map(c => c.textContent))) + '\n\n',
  });
  // Same as Turndown's list rule, but with one space after the marker ("- item", not "-   item").
  turndown.addRule('listItem', {
    filter: 'li',
    replacement: (content, node) => {
      const list = node.parentNode;
      const index = [...list.children].indexOf(node);
      const prefix = list.nodeName === 'OL' ? `${(+list.getAttribute('start') || 1) + index}. ` : '- ';
      content = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, '\n' + ' '.repeat(prefix.length));
      return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    },
  });
  // Embedded base64 images bloat the output, so keep only their alt text.
  turndown.addRule('dataImage', {
    filter: n => n.nodeName === 'IMG' && (n.getAttribute('src') || '').startsWith('data:'),
    replacement: (_, n) => n.getAttribute('alt') ? `*[Image: ${n.getAttribute('alt')}]*` : '',
  });
  return turndown;
}

export function htmlToMd(root) {
  return service().turndown(root);
}

export async function htmlFileToMd(file) {
  return htmlToMd(parseHtml(await file.text()).body);
}
