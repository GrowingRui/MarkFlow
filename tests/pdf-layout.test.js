// pdfLines and pdfBlocks without PDF.js: text items are built by hand, so each layout rule is tested on its own.
import { describe, expect, it } from 'vitest';
import { pdfBlocks, pdfLines } from '../src/convert/pdf.js';

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
