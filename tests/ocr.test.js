import { describe, expect, it } from 'vitest';
import { ocrBlocksToMd, ocrTextToMd } from '../src/convert/ocr.js';

describe('ocrTextToMd', () => {
  it('rejoins broken lines into paragraphs', () => {
    expect(ocrTextToMd('Invoices are due\nin thirty days.\n\n  \nContact billing.\n')).toBe('Invoices are due in thirty days.\n\nContact billing.');
  });
});

// Tesseract output for one paragraph: lines 20px tall and 26px apart unless a top is given; x1 is where the line ends.
const para = (...lines) => ({
  lines: lines.map(([text, x1 = 500, opts = {}], i) => {
    const y0 = opts.y0 ?? 100 + i * 26;
    return { text: text + '\n', bbox: { x0: opts.x0 ?? 50, y0, x1, y1: y0 + 20 } };
  }),
});
const md = (...paragraphs) => ocrBlocksToMd([{ paragraphs }]);

describe('ocrBlocksToMd', () => {
  it('keeps Tesseract paragraphs apart and joins their lines', () => {
    expect(md(para(['First paragraph runs'], ['onto a second line.', 300]), para(['Second one.', 200]))).toBe('First paragraph runs onto a second line.\n\nSecond one.');
  });
  it('splits a paragraph after a short line that ends a sentence', () => {
    expect(md(para(['The first paragraph'], ['ends here.', 200], ['The second starts'], ['and ends.', 180]))).toBe('The first paragraph ends here.\n\nThe second starts and ends.');
  });
  it('does not split after a full-width line that ends a sentence', () => {
    expect(md(para(['A sentence ends at the margin.'], ['Another follows.', 260]))).toBe('A sentence ends at the margin. Another follows.');
  });
  it('splits where a vertical gap opens between lines', () => {
    expect(md(para(['Heading'], ['Body text', 500, { y0: 150 }]))).toBe('Heading\n\nBody text');
  });
  it('rejoins hyphenated words and turns bullets and numbers into list items', () => {
    expect(md(para(['Read the con-'], ['tract first'], ['• Sign it'], ['and date it'], ['2) Send it back', 300])))
      .toBe('Read the contract first\n\n- Sign it and date it\n2. Send it back');
  });
  it('rejoins a sentence Tesseract split into two paragraphs', () => {
    expect(md(para(['Samples stay at the station until the'], ['autumn review, when the con-', 300]), para(['tract is renewed.', 200]), para(['Next paragraph.', 200])))
      .toBe('Samples stay at the station until the autumn review, when the contract is renewed.\n\nNext paragraph.');
  });
  it('reads « and similar misread bullets as list items', () => {
    expect(md(para(['« Label every sample'], ['° Log the time', 300]))).toBe('- Label every sample\n- Log the time');
  });
});
