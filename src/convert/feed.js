// RSS and Atom feeds: the feed's title and description, then each post with its link, date and text.
import { htmlToMd } from './html.js';
import { joinBlocks, parseHtml } from './markdown.js';

// The root element names a feed: <rss>, Atom's <feed> (in the Atom namespace, as any XML can have a
// <feed> element), or RSS 1.0's <rdf:RDF> with items.
export function isFeed(doc) {
  const root = doc.documentElement;
  return root?.localName === 'rss'
    || (root?.localName === 'feed' && root.namespaceURI === 'http://www.w3.org/2005/Atom')
    || (root?.localName === 'RDF' && [...root.children].some(c => c.localName === 'item'));
}

// The text of the first direct child with one of the given names, ignoring namespace prefixes.
const field = (el, ...names) => [...el.children].find(c => names.includes(c.localName))?.textContent.trim() ?? '';
// Atom gives links as <link href="…" rel="alternate">; RSS as the element's text.
const linkOf = el => {
  const links = [...el.children].filter(c => c.localName === 'link');
  const atom = links.find(l => l.getAttribute('href') && (l.getAttribute('rel') ?? 'alternate') === 'alternate');
  return atom?.getAttribute('href') ?? links.find(l => l.textContent.trim())?.textContent.trim() ?? '';
};
// Descriptions are usually HTML, sometimes plain text.
const textOf = s => /<[a-z][\s\S]*>/i.test(s) ? htmlToMd(parseHtml(s).body).trim() : s.replace(/\s+/g, ' ').trim();

export function feedToMd(doc) {
  const root = doc.documentElement;
  const channel = [...root.children].find(c => c.localName === 'channel') ?? root;
  const blocks = [];
  const title = field(channel, 'title');
  if (title) blocks.push(`# ${title}`);
  const about = field(channel, 'description', 'subtitle');
  if (about) blocks.push(textOf(about));
  // RSS 2.0 puts items in the channel, RSS 1.0 beside it, Atom calls them entries.
  const items = [...root.getElementsByTagName('*')].filter(el => el.localName === 'item' || el.localName === 'entry');
  for (const item of items) {
    const name = field(item, 'title') || 'Untitled';
    const link = linkOf(item);
    blocks.push(`## ${link ? `[${name}](${link})` : name}`);
    const date = field(item, 'pubDate', 'published', 'updated', 'date');
    if (date) blocks.push(`*${date}*`);
    // Full content when the feed has it, otherwise the summary.
    const body = field(item, 'encoded', 'content') || field(item, 'description', 'summary');
    if (body) blocks.push(textOf(body));
  }
  return joinBlocks(blocks);
}
