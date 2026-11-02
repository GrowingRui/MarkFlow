import { describe, expect, it } from 'vitest';
import { bodySize, pdfBlocks, pdfLayout, pdfLines } from '../src/convert/layout.js';
import { ocrItems, ocrTextToMd } from '../src/convert/ocr.js';

describe('ocrTextToMd', () => {
  it('rejoins broken lines into paragraphs', () => {
    expect(ocrTextToMd('Invoices are due\nin thirty days.\n\n  \nContact billing.\n')).toBe('Invoices are due in thirty days.\n\nContact billing.');
  });
});

// Tesseract's blocks for lines of words: each line is [top, size, [text, x0, x1], ...], with words 20px tall.
const scan = (...lines) => [{
  paragraphs: [{
    lines: lines.map(([top, size, ...words]) => ({
      text: words.map(w => w[0]).join(' '),
      bbox: { x0: words[0][1], y0: top, x1: words[words.length - 1][2], y1: top + 20 },
      baseline: { x0: words[0][1], y0: top + 20, x1: words[words.length - 1][2], y1: top + 20, has_baseline: true },
      words: words.map(([text, x0, x1]) => ({ text, font_size: size, bbox: { x0, y0: top, x1, y1: top + 20 } })),
    })),
  }],
}];
const md = blocks => {
  const lines = pdfLayout(pdfLines(ocrItems(blocks)));
  return pdfBlocks(lines, bodySize(lines));
};

describe('ocrItems', () => {
  it('places words on their line, top to bottom, with a space between words however close', () => {
    const lines = pdfLines(ocrItems(scan([100, 24, ['occurring', 50, 160], ['3-4', 162, 200]], [140, 24, ['times', 50, 110]]), { scale: 2 }));
    expect(lines.map(l => l.text)).toEqual(['occurring 3-4', 'times']);
    expect(lines[0].x).toBe(25);
  });
  it('treats sizes near the usual one as body text and groups larger ones', () => {
    const items = ocrItems(scan([0, 36, ['TITLE', 50, 200]], [40, 34, ['SECTION', 50, 200]], [80, 20, ['the body text of the page', 50, 400]], [120, 24, ['runs on over several lines', 50, 400]], [160, 27, ['at about the same size', 50, 400]]));
    expect(items.map(i => i.transform[0])).toEqual([36, 36, 24, 24, 24]);
  });
  it('reads a misread bullet at the start of a line as a bullet', () => {
    expect(md(scan([100, 24, ['«+', 50, 60], ['Primary', 70, 150], ['care', 160, 200]]))).toEqual(['- Primary care']);
  });
  it('rebuilds a table from words lined up in columns', () => {
    expect(md(scan(
      [100, 24, ['Test', 50, 100], ['Result', 300, 380], ['Flag', 550, 600]],
      [140, 24, ['Glucose', 50, 140], ['118', 300, 340], ['HIGH', 550, 610]],
      [180, 24, ['TSH', 50, 100], ['2.4', 300, 340], ['-', 550, 560]],
    ))).toEqual(['| Test | Result | Flag |\n| --- | --- | --- |\n| Glucose | 118 | HIGH |\n| TSH | 2.4 | - |']);
  });
});
