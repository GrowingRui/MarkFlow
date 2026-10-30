import { describe, expect, it } from 'vitest';
import { ocrTextToMd } from '../src/convert/ocr.js';

describe('ocrTextToMd', () => {
  it('rejoins broken lines into paragraphs', () => {
    expect(ocrTextToMd('Invoices are due\nin thirty days.\n\n  \nContact billing.\n')).toBe('Invoices are due in thirty days.\n\nContact billing.');
  });
});
