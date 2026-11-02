// Page graphics from hand-built operator lists, and what the layout does with them.
import { describe, expect, it } from 'vitest';
import { OPS } from 'pdfjs-dist';
import { dropFigureText, markRules, pageGraphics } from '../src/convert/graphics.js';
import { makeLine, pdfLayout, pdfLines } from '../src/convert/layout.js';

const VIEW = [0, 0, 612, 792];
// An operator list from [operator name, args] pairs.
const ops = (...list) => ({ fnArray: list.map(([name]) => OPS[name]), argsArray: list.map(([, args]) => args ?? null) });
const rect = (x, y, w, h) => ['constructPath', [[OPS.rectangle], [x, y, w, h]]];
const polyline = (...points) => ['constructPath', [[OPS.moveTo, ...points.slice(1).map(() => OPS.lineTo)], points.flat()]];
const item = (str, x, y, size = 10) => ({ str, width: str.length * size * 0.5, transform: [size, 0, 0, size, x, y] });

describe('pageGraphics', () => {
  it('finds rules and bars, through the transforms they are drawn with', () => {
    const { rules, bars } = pageGraphics(ops(
      ['save'], ['transform', [2, 0, 0, 2, 10, 0]], rect(30, 100, 100, 0.5), ['fill'], ['restore'],
      rect(72, 400, 300, 16), ['fill'],
      rect(72, 300, 300, 0.8), ['endPath'], // a clipping path, never painted
    ), OPS, VIEW);
    expect(rules).toEqual([{ x0: 70, y0: 200, x1: 270, y1: 201 }]);
    expect(bars).toEqual([{ x0: 72, y0: 400, x1: 372, y1: 416 }]);
  });
  it('takes several curved or slanted shapes drawn together, with their axes, as a figure', () => {
    const { figures } = pageGraphics(ops(
      polyline([100, 100], [100, 200]), polyline([100, 100], [300, 100]), ['stroke'],
      polyline([100, 110], [150, 150], [200, 130]), polyline([100, 120], [150, 160]), polyline([150, 120], [200, 180]), ['stroke'],
    ), OPS, VIEW);
    expect(figures).toEqual([{ x0: 100, y0: 100, x1: 300, y1: 200 }]);
    // One rounded or slanted shape alone (a box around a paragraph) isn't a figure.
    expect(pageGraphics(ops(polyline([100, 100], [150, 150]), ['stroke']), OPS, VIEW).figures).toEqual([]);
  });
});

describe('dropFigureText', () => {
  const chart = { x0: 100, y0: 100, x1: 300, y1: 200 };
  it('leaves out labels in and beside a chart but keeps sentences and longer text', () => {
    const lines = pdfLines([item('Revenue', 150, 180), item('100', 85, 196, 7), item('Jan', 100, 90, 7),
      item('Figure 1. Revenue by month.', 100, 70), item('A paragraph that runs on beside it.', 320, 150)]);
    expect(dropFigureText(lines, [chart], makeLine).map(l => l.text)).toEqual(['A paragraph that runs on beside it.', 'Figure 1. Revenue by month.']);
  });
  it('keeps everything in a drawing that is mostly text, such as a worksheet in rounded boxes', () => {
    const lines = pdfLines(Array.from({ length: 9 }, (_, i) => item('Line ' + i + ' of the form', 105, 190 - i * 11)));
    expect(dropFigureText(lines, [chart], makeLine)).toHaveLength(9);
  });
});

describe('rules and tables', () => {
  it('ends an unruled table at a bar with a heading in it, and starts a new one under it', () => {
    const row = (y, ...cells) => cells.map(([t, x]) => item(t, x, y));
    const lines = pdfLines([
      ...row(500, ['Item', 72], ['Qty', 300], ['Price', 400]), ...row(484, ['Tickets', 72], ['3', 300], ['45.00', 400]),
      ...row(468, ['Guide', 72], ['1', 300], ['12.00', 400]), item('Totals', 250, 452),
      ...row(436, ['Subtotal', 72], ['57.00', 400]), ...row(420, ['Tax', 72], ['10%', 300], ['5.70', 400]), ...row(404, ['Total', 72], ['62.70', 400]),
    ]);
    markRules(lines, { rules: [], bars: [{ x0: 70, y0: 448, x1: 470, y1: 464 }] });
    expect(pdfLayout(lines).map(l => l.table ? l.table.length + ' rows' : l.text)).toEqual(['3 rows', 'Totals', '3 rows']);
  });
});
