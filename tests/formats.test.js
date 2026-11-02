// Rules from the non-PDF converters that the fixtures don't show on their own.
import { describe, expect, it } from 'vitest';
import { decodeText } from '../src/convert/encoding.js';
import { mainContent } from '../src/convert/html.js';
import { parseHtml, parseXml } from '../src/convert/markdown.js';
import { ommlToLatex } from '../src/convert/omml.js';

const hex = s => Uint8Array.from(s.match(/../g).map(b => parseInt(b, 16)));

describe('decodeText', () => {
  it('reads Shift-JIS even in a file too short for statistics', () => {
    // 名前,住所 / 佐藤,東京 — kanji only, no kana to give the encoding away
    expect(decodeText(hex('96bc914f2c8f5a8f8a0a8db293a12c938c8b9e0a'))).toBe('名前,住所\n佐藤,東京\n');
  });
  it('falls back to Windows-1252 for Western text', () => {
    expect(decodeText(hex('436166e92c4de16c616761'))).toBe('Café,Málaga');
  });
  it('prefers a byte order mark, then the encoding a file declares, then UTF-8', () => {
    expect(decodeText(hex('efbbbf43c3a9'))).toBe('Cé');
    expect(decodeText(hex('e9'), 'windows-1252')).toBe('é');
    expect(decodeText(new TextEncoder().encode('naïve'))).toBe('naïve');
  });
});

describe('mainContent', () => {
  it('takes a MediaWiki article and its title, without edit links or navigation boxes', () => {
    const doc = parseHtml(`<div id="p-lang">154 languages</div><h1 id="firstHeading"><span>Tides</span></h1>
      <div id="mw-content-text"><p>Tides rise.</p><span class="mw-editsection">[edit]</span><table class="navbox"><tr><td>Oceans</td></tr></table></div>`);
    const root = mainContent(doc);
    expect(root.querySelector('h1').textContent).toBe('Tides');
    expect(root.textContent).not.toMatch(/languages|edit|Oceans/);
  });
  it('uses the whole page when nothing marks the main content, or there are several articles', () => {
    expect(mainContent(parseHtml('<nav>Menu</nav><p>Text</p>')).textContent).toContain('Menu');
    expect(mainContent(parseHtml('<article>One</article><article>Two</article>')).textContent).toBe('OneTwo');
  });
});

describe('ommlToLatex', () => {
  const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
  const latex = body => ommlToLatex(parseXml(`<m:oMath ${M}>${body}</m:oMath>`).documentElement);
  const r = t => `<m:r><m:t>${t}</m:t></m:r>`;

  it('writes sums with limits, square brackets and roots with a degree', () => {
    expect(latex(`<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${r('i=1')}</m:sub><m:sup>${r('n')}</m:sup><m:e>${r('i')}</m:e></m:nary>`))
      .toBe('\\sum_{i=1}^{n}{i}');
    expect(latex(`<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e>${r('a,b')}</m:e></m:d>`)).toBe('\\left[a,b\\right]');
    expect(latex(`<m:rad><m:deg>${r('3')}</m:deg><m:e>${r('x')}</m:e></m:rad>`)).toBe('\\sqrt[3]{x}');
  });
  it('writes matrices, function names and escapes LaTeX special characters', () => {
    expect(latex(`<m:m><m:mr><m:e>${r('1')}</m:e><m:e>${r('0')}</m:e></m:mr><m:mr><m:e>${r('0')}</m:e><m:e>${r('1')}</m:e></m:mr></m:m>`))
      .toBe('\\begin{matrix}1 & 0 \\\\ 0 & 1\\end{matrix}');
    expect(latex(r('sinh x+cos y'))).toBe('\\sinh x+\\cos y');
    expect(latex(r('50%'))).toBe('50\\%');
  });
  it('sets words Word marks as upright text in \\mathrm, but function names as commands', () => {
    const upright = t => `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>${t}</m:t></m:r>`;
    expect(latex(upright('sin') + r('θ') + upright('mm'))).toBe('\\sin \\theta \\mathrm{mm}');
  });
});
