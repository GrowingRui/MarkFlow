import TurndownService from 'turndown';
import { mdTable, parseHtml } from './markdown.js';

let turndown;
function service() {
  if (turndown) return turndown;
  turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
  turndown.remove(['script', 'style', 'noscript', 'iframe', 'template']);
  turndown.addRule('table', {
    filter: 'table',
    replacement: (_, node) => '\n\n' + mdTable([...node.rows].map(r => [...r.cells].map(cellText))) + '\n\n',
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
  // A link that runs a script goes nowhere outside the page, so only its text is kept.
  turndown.addRule('scriptLink', {
    filter: n => n.nodeName === 'A' && /^\s*javascript:/i.test(n.getAttribute('href') || ''),
    replacement: content => content,
  });
  return turndown;
}

// A table cell's text, keeping words apart where the cell breaks a line or starts a new block, and
// separating list items with commas ("Bill Gates, Paul Allen", not "Bill GatesPaul Allen").
function cellText(cell) {
  const copy = cell.cloneNode(true);
  for (const li of copy.querySelectorAll('li')) if (li.nextElementSibling) li.append(', ');
  for (const el of copy.querySelectorAll('br, p, div, li, tr, dd, dt')) el.after(' ');
  return copy.textContent.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
}

export function htmlToMd(root) {
  return service().turndown(root);
}

export async function htmlFileToMd(file) {
  const { decodeText } = await import('./encoding.js');
  const bytes = new Uint8Array(await file.arrayBuffer());
  // A page may name its encoding near the top, as <meta charset="gbk"> or in a content-type meta tag.
  const declared = new TextDecoder('latin1').decode(bytes.slice(0, 4096)).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const doc = parseHtml(decodeText(bytes, declared));
  absoluteLinks(doc);
  return htmlToMd(mainContent(doc));
}

// Links such as /wiki/Bill_Gates only work on the page's own site. When a saved page says where it
// came from (a <base>, or the canonical address most sites give), they are made absolute.
function absoluteLinks(doc) {
  const base = doc.querySelector('base[href]')?.getAttribute('href') ?? doc.querySelector('link[rel=canonical][href]')?.getAttribute('href')
    ?? doc.querySelector('meta[property="og:url"][content]')?.getAttribute('content');
  if (!base || !/^https?:\/\//i.test(base)) return;
  for (const [selector, attr] of [['a[href]', 'href'], ['img[src]', 'src']]) {
    for (const el of doc.querySelectorAll(selector)) {
      const value = el.getAttribute(attr);
      if (/^(#|[a-z][a-z0-9+.-]*:)/i.test(value)) continue;
      try { el.setAttribute(attr, new URL(value, base).href); } catch { /* leave a malformed address alone */ }
    }
  }
}

// A web page saved from a site carries its menus, sidebars and footer. When the page marks its main
// content (a <main>, or a single <article>), only that is converted, without navigation inside it.
export function mainContent(doc) {
  // Wikipedia (and other MediaWiki sites): the page title and the article, without edit links,
  // navigation boxes and other parts the site marks as not for print.
  const wiki = doc.getElementById('mw-content-text');
  if (wiki) {
    const root = doc.createElement('div');
    const title = doc.getElementById('firstHeading');
    if (title) root.append(Object.assign(doc.createElement('h1'), { textContent: title.textContent.trim() }));
    root.append(wiki);
    for (const el of root.querySelectorAll('.mw-editsection, .navbox, .sidebar, .noprint, .mw-jump-link, style')) el.remove();
    return root;
  }
  const articles = doc.querySelectorAll('article');
  const main = doc.querySelector('main') ?? (articles.length === 1 ? articles[0] : null);
  if (!main) return doc.body;
  for (const nav of main.querySelectorAll('nav')) nav.remove();
  return main;
}
