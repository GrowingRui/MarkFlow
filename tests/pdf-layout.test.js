// pdfLines and pdfBlocks without PDF.js: text items are built by hand, so each layout rule is tested on its own.
import { describe, expect, it } from 'vitest';
import { pdfBlocks, pdfLayout, pdfLines } from '../src/convert/pdf.js';

// A PDF.js text item. transform = [scaleX, skewY, skewX, scaleY, x, y]; y grows upwards.
const item = (str, x, y, size = 10, width = str.length * size * 0.5) => ({ str, width, transform: [size, 0, 0, size, x, y] });
// Lines 14pt apart from the top of the page, unless a position is given.
const lines = (...rows) => rows.map(([text, opts = {}], i) => ({ text, x: opts.x ?? 72, y: opts.y ?? 700 - i * 14, size: opts.size ?? 10 }));

describe('pdfLines', () => {
  it('merges items on the same baseline in reading order and inserts spaces at gaps', () => {
    const out = pdfLines([item('world', 120, 700), item('Hello', 72, 700), item('Next', 72, 686), item('', 0, 0)]);
    expect(out.map(l => l.text)).toEqual(['Hello world', 'Next']);
  });
  it('does not add a space between items that touch', () => {
    expect(pdfLines([item('con', 72, 700, 10, 15), item('tract', 87, 700)])[0].text).toBe('contract');
  });
  it('splits a line into segments at wide gaps but keeps a bullet with its text', () => {
    const [row, bullet] = pdfLines([item('Left', 72, 700), item('Right', 320, 700), item('•', 72, 686), item('Item', 100, 686)]);
    expect(row.segs.map(s => s.text)).toEqual(['Left', 'Right']);
    expect(row.text).toBe('Left Right');
    expect(bullet.segs.map(s => s.text)).toEqual(['• Item']);
  });
  it('orders items on a row by x even when their baselines differ slightly', () => {
    expect(pdfLines([item('world', 120, 700.3), item('Hello', 72, 700)])[0].text).toBe('Hello world');
  });
  it('takes the largest font size on the line', () => {
    expect(pdfLines([item('A', 72, 700, 10), item('B', 90, 701, 14)])[0].size).toBe(14);
  });
});

describe('pdfBlocks', () => {
  it('maps font size relative to body text to heading levels', () => {
    const out = pdfBlocks(lines(['Title', { size: 16 }], ['Section', { size: 13 }], ['Minor', { size: 11.5 }], ['Body text.']), 10);
    expect(out).toEqual(['# Title', '## Section', '### Minor', 'Body text.']);
  });
  it('joins a heading that wraps onto a second line', () => {
    expect(pdfBlocks(lines(['A long', { size: 20 }], ['heading', { size: 20 }]), 10)).toEqual(['# A long heading']);
  });
  it('does not treat long large lines as headings', () => {
    expect(pdfBlocks(lines(['x'.repeat(130), { size: 20 }]), 10)[0]).not.toMatch(/^#/);
  });
  it('joins wrapped lines into one paragraph and removes hyphenation', () => {
    expect(pdfBlocks(lines(['Revenue grew in new con-'], ['tracts this year.']), 10)).toEqual(['Revenue grew in new contracts this year.']);
  });
  it('starts a new paragraph after a vertical gap', () => {
    expect(pdfBlocks(lines(['First.', { y: 700 }], ['Second.', { y: 660 }]), 10)).toEqual(['First.', 'Second.']);
  });
  it('turns bullets and numbers into list items, including wrapped items', () => {
    const out = pdfBlocks(lines(['• One that'], ['wraps', { x: 84 }], ['2) Two'], ['After the list.']), 10);
    expect(out).toEqual(['- One that wraps', '2. Two', 'After the list.']);
  });
});

// A page of rows; each row is a list of [text, x] pieces, 14pt apart from the top.
const page = (...rows) => pdfLines(rows.flatMap((pieces, i) => pieces.map(([str, x, size]) => item(str, x, 700 - i * 14, size))));
const texts = entries => entries.map(e => e.table ?? e.text);
const prose = n => `column text line number ${n} goes here`;

describe('pdfLayout', () => {
  it('reads two columns one after the other, below a full-width title', () => {
    const out = pdfLayout(page(
      [['A title that runs right across both of the columns', 72, 16]],
      [[prose(1), 72], [prose(4), 320]],
      [[prose(2), 72], [prose(5), 320]],
      [[prose(3), 72], [prose(6), 320]],
    ));
    expect(texts(out)).toEqual(['A title that runs right across both of the columns', ...[1, 2, 3, 4, 5, 6].map(prose)]);
  });
  it('turns rows of short aligned cells into a table and merges wrapped cells', () => {
    const out = pdfLayout(page(
      [['Revenue by region, before and after the reorganisation this year', 72]],
      [['Region', 72], ['Q2', 250], ['Q3', 400]],
      [['EU', 72], ['1.2M', 250], ['1.6M', 400]],
      [['', 72], ['', 250], ['(est.)', 400]],
      [['US', 72], ['2.0M', 250], ['2.1M', 400]],
      [['The numbers above are not audited and may still change later on.', 72]],
    ));
    expect(texts(out)).toEqual([
      'Revenue by region, before and after the reorganisation this year',
      [['Region', 'Q2', 'Q3'], ['EU', '1.2M', '1.6M (est.)'], ['US', '2.0M', '2.1M']],
      'The numbers above are not audited and may still change later on.',
    ]);
  });
  it('leaves single-column text alone, including short lines and a right-aligned page number', () => {
    const lines = page(
      [['Summary', 72]], [['A paragraph of ordinary text that fills the line.', 72]], [['Its short end.', 72]],
      [['Details', 72]], [['Another paragraph of ordinary text filling the line.', 72]], [['7', 500]],
    );
    expect(pdfLayout(lines)).toEqual(lines);
  });
});

describe('pdfBlocks with layout', () => {
  it('carries an unfinished sentence into the next column but not a finished one', () => {
    const out = pdfBlocks(pdfLayout(page(
      [['The first column ends in the middle of a', 72], ['sentence that carries on here. Then it', 320]],
      [['long sentence that keeps on going and', 72], ['stops. A new paragraph does not follow.', 320]],
    )), 10);
    expect(out).toEqual(['The first column ends in the middle of a long sentence that keeps on going and sentence that carries on here. Then it stops. A new paragraph does not follow.']);
  });
  it('writes tables as Markdown between paragraphs', () => {
    expect(pdfBlocks([...lines(['Before.']), { table: [['A', 'B'], ['1', '2']] }, ...lines(['After.', { y: 600 }])], 10))
      .toEqual(['Before.', '| A | B |\n| --- | --- |\n| 1 | 2 |', 'After.']);
  });
});
