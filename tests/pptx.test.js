// slideToMd on hand-written slide XML, for the title and list rules the generated deck doesn't cover.
import { describe, expect, it } from 'vitest';
import { slideToMd } from '../src/convert/pptx.js';
import { parseXml } from '../src/convert/markdown.js';

const NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
// A paragraph: text plus optional bullet ('char', 'num', 'none'), level and font size in points.
const para = (text, { bullet, lvl = 0, size } = {}) => {
  const marker = { char: '<a:buChar char="•"/>', num: '<a:buAutoNum type="arabicPeriod"/>', none: '<a:buNone/>' }[bullet] ?? '';
  return `<a:p><a:pPr lvl="${lvl}">${marker}</a:pPr><a:r><a:rPr lang="en-US"${size ? ` sz="${size * 100}"` : ''}/><a:t>${text}</a:t></a:r></a:p>`;
};
// A text box at a vertical position, or a placeholder when ph is given.
const box = (y, paras, ph) => `<p:sp><p:nvSpPr><p:cNvPr id="1" name=""/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr>`
  + `<p:spPr><a:xfrm><a:off x="0" y="${y}"/><a:ext cx="1" cy="1"/></a:xfrm></p:spPr><p:txBody>${paras.join('')}</p:txBody></p:sp>`;
const slide = (...shapes) => slideToMd(parseXml(`<p:sld ${NS}><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`));

describe('slideToMd', () => {
  it('prefers the title placeholder over a larger text box', () => {
    expect(slide(box(0, [para('Banner', { size: 40 })]), box(100, [para('Real title')], 'title')).title).toBe('Real title');
  });
  it('does not guess a title when two lines share the largest size', () => {
    const out = slide(box(0, [para('Small', { size: 10 })]), box(100, [para('One', { size: 30 })]), box(200, [para('Two', { size: 30 })]));
    expect(out.title).toBe('');
    expect(out.body).toEqual(['Small', 'One', 'Two']);
  });
  it('does not take a long or bulleted top line as the title', () => {
    expect(slide(box(0, [para('x'.repeat(120))])).title).toBe('');
    expect(slide(box(0, [para('Point', { bullet: 'char' })])).title).toBe('');
  });
  it('restarts numbering after a paragraph and in each shape', () => {
    const out = slide(
      box(0, [para('Title')]),
      box(100, [para('A', { bullet: 'num' }), para('B', { bullet: 'num' }), para('Note'), para('C', { bullet: 'num' })]),
      box(200, [para('D', { bullet: 'num' })]),
    );
    expect(out.body).toEqual(['1. A', '2. B', 'Note', '1. C', '1. D']);
  });
  it('nests items under their parent and never skips a level', () => {
    const out = slide(box(0, [para('T')]), box(100, [para('A', { bullet: 'char', lvl: 0 }), para('B', { bullet: 'char', lvl: 2 }), para('C', { bullet: 'num', lvl: 1 })]));
    expect(out.body).toEqual(['- A', '  - B', '  1. C']);
  });
  it('bullets body placeholder paragraphs by default but not subtitles', () => {
    expect(slide(box(0, [para('T')], 'title'), box(100, [para('Point'), para('Plain', { bullet: 'none' })], 'body')).body).toEqual(['- Point', 'Plain']);
    expect(slide(box(0, [para('T')], 'ctrTitle'), box(100, [para('By the team')], 'subTitle')).body).toEqual(['By the team']);
  });
});
