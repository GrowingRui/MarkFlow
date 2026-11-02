// What a PDF page draws besides text, read from PDF.js's operator list: rules (thin lines and bars,
// which mark table rows and section breaks) and figures (drawings with curves or slanted lines, such
// as charts and diagrams). Pictures don't count: text on a picture is usually content, since a
// picture's own labels are part of the picture. Coordinates are in PDF points, y up, like the text's.

const multiply = ([a, b, c, d, e, f], [g, h, i, j, k, l]) => [
  a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f,
];
const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];
const box = points => ({
  x0: Math.min(...points.map(p => p[0])), y0: Math.min(...points.map(p => p[1])),
  x1: Math.max(...points.map(p => p[0])), y1: Math.max(...points.map(p => p[1])),
});

/**
 * @param {{ fnArray: number[], argsArray: any[] }} opList from page.getOperatorList()
 * @param {Record<string, number>} OPS PDF.js's operator codes
 * @param {number[]} view the page's [x0, y0, x1, y1]
 * @returns {{ rules: Box[], bars: Box[], figures: Box[] }} where a Box is { x0, y0, x1, y1 }
 */
export function pageGraphics({ fnArray, argsArray }, OPS, view) {
  const pageArea = (view[2] - view[0]) * (view[3] - view[1]);
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let pending = [];
  const rules = [], bars = [], drawings = [];
  const paints = new Set(['stroke', 'closeStroke', 'fill', 'eoFill', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke'].map(n => OPS[n]));

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args?.[0]) ctm = multiply(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.constructPath) pending.push(...pathShapes(args, ctm, OPS));
    else if (paints.has(fn)) {
      for (const shape of pending) {
        const { x0, y0, x1, y1 } = shape.box;
        const [w, h] = [x1 - x0, y1 - y0];
        // A thin rectangle or a straight line, across or down the page, is a rule.
        if (!shape.curved && (w >= 15 && h <= 2.5 || h >= 15 && w <= 2.5)) rules.push(shape.box);
        // A wide, low box (a coloured bar behind a heading or a table's header row).
        else if (!shape.curved && w >= 60 && h > 2.5 && h <= 30) bars.push(shape.box);
        // Everything else may be part of a drawing: curves and slanted lines, and the boxes, axes and
        // ticks drawn with them (but not a frame around most of the page).
        if (shape.curved || w * h < pageArea * 0.5) drawings.push(shape);
      }
      pending = [];
    } else if (fn === OPS.endPath) pending = [];
  }
  return { rules, bars, figures: figureClusters(drawings) };
}

// The painted shapes in a constructPath: [subpath operators, flat coordinates]. Each subpath becomes
// { box, curved, segments }, where curved means it has curves or slanted lines.
function pathShapes([ops, coords], ctm, OPS) {
  const shapes = [];
  let points = [], curved = false, segments = 0, k = 0, last = null;
  const close = () => {
    if (points.length) shapes.push({ box: box(points), curved, segments });
    points = []; curved = false; segments = 0;
  };
  for (const op of ops) {
    if (op === OPS.rectangle) {
      close();
      const [x, y, w, h] = coords.slice(k, k += 4);
      points = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => apply(ctm, px, py));
      close();
    } else if (op === OPS.moveTo) {
      close();
      last = apply(ctm, coords[k], coords[k + 1]); k += 2;
      points.push(last);
    } else if (op === OPS.lineTo) {
      const p = apply(ctm, coords[k], coords[k + 1]); k += 2;
      if (last && Math.abs(p[0] - last[0]) > 0.5 && Math.abs(p[1] - last[1]) > 0.5) curved = true;
      points.push(p); segments++; last = p;
    } else if (op === OPS.curveTo || op === OPS.curveTo2 || op === OPS.curveTo3) {
      const n = op === OPS.curveTo ? 6 : 4;
      const xy = coords.slice(k, k += n);
      for (let j = 0; j < n; j += 2) points.push(apply(ctm, xy[j], xy[j + 1]));
      last = points[points.length - 1]; curved = true; segments++;
    }
  }
  close();
  return shapes;
}

// Shapes that touch or nearly touch (within 6pt) form one drawing. A drawing is a figure if it has
// several curved or slanted shapes, or a long one (a plotted line), so that a table's ruled boxes or
// a single rounded box around a paragraph isn't taken for one.
function figureClusters(drawings) {
  const clusters = [];
  for (const d of drawings) {
    const near = c => d.box.x0 < c.box.x1 + 6 && d.box.x1 > c.box.x0 - 6 && d.box.y0 < c.box.y1 + 6 && d.box.y1 > c.box.y0 - 6;
    const hits = clusters.filter(near);
    const merged = { box: { ...d.box }, shapes: d.curved ? 1 : 0, segments: d.curved ? d.segments : 0 };
    for (const c of hits) {
      merged.box = { x0: Math.min(merged.box.x0, c.box.x0), y0: Math.min(merged.box.y0, c.box.y0), x1: Math.max(merged.box.x1, c.box.x1), y1: Math.max(merged.box.y1, c.box.y1) };
      merged.shapes += c.shapes;
      merged.segments += c.segments;
      clusters.splice(clusters.indexOf(c), 1);
    }
    clusters.push(merged);
  }
  return clusters.filter(c => c.shapes >= 3 || c.segments >= 20).map(c => c.box);
}

const inside = (x, y, b, margin = 2) => x >= b.x0 - margin && x <= b.x1 + margin && y >= b.y0 - margin && y <= b.y1 + margin;

/**
 * Labels inside a figure (axis numbers, legend entries, boxes in a diagram) are left out: segments of
 * a line whose middle lies in a figure (one of `drawings` with little text) and that are short. Longer text, such as a paragraph printed
 * over a picture, stays. `rebuild(segs, line)` makes a line from the segments left.
 */
export function dropFigureText(lines, drawings, rebuild) {
  // A chart or diagram is mostly drawing with a few labels; a worksheet or form drawn with rounded
  // boxes is mostly text, and keeps all of it. So a drawing counts as a figure only while text covers
  // no more than 15% of it.
  const figures = drawings.filter(f => {
    let text = 0;
    for (const l of lines) for (const s of l.segs) if (inside((s.x + s.end) / 2, l.y + l.size / 3, f, 0)) text += (s.end - s.x) * l.size;
    return text <= (f.x1 - f.x0) * (f.y1 - f.y0) * 0.15;
  });
  if (!figures.length) return lines;
  return lines.flatMap(line => {
    const keep = line.segs.filter(s => {
      const text = s.text.trim();
      const inFigure = figures.some(f => inside((s.x + s.end) / 2, line.y + line.size / 3, f, 2));
      // Tick labels sit just outside a chart's axes: a number or a word or two ("100", "Jan", "iter.
      // (1e4)") within 12pt of a chart-sized figure is one of its labels too. Anything longer, such as
      // a title under a logo, stays, and so do words beside a small icon.
      const label = text.length <= 12 && text.split(/\s+/).length <= 2 && !/[.!?:]$/.test(text) && figures.some(f => f.x1 - f.x0 >= 60 && f.y1 - f.y0 >= 40
        && s.x < f.x1 + 12 && s.end > f.x0 - 12 && line.y < f.y1 + 12 && line.y + line.size > f.y0 - 12);
      return !(inFigure || label) || text.length > 40;
    });
    if (keep.length === line.segs.length) return [line];
    return keep.length ? [rebuild(keep, line)] : [];
  });
}

// Marks the segments of each line that have a rule just above them (between them and the line before,
// running the width of the segment), and a lone line of text set in a bar much wider than itself, as a
// section heading in a form. Tables use the marks to tell a ruled section from unruled rows before it.
export function markRules(lines, { rules, bars }) {
  for (let i = 0; i < lines.length; i++) {
    const [prev, line] = [lines[i - 1], lines[i]];
    for (const s of line.segs) {
      const ruled = prev && prev.y > line.y && rules.some(r => r.y1 - r.y0 <= 2.5
        && r.y0 < prev.y && r.y1 > line.y + line.size * 0.8 && r.x0 < s.x + 2 && r.x1 > s.end - 2);
      const barred = line.segs.length === 1 && bars.some(b => inside((s.x + s.end) / 2, line.y + line.size / 3, b, 0) && b.x1 - b.x0 >= (s.end - s.x) * 2);
      if (ruled || barred) s.ruleAbove = true;
    }
    if (line.segs.some(s => s.ruleAbove)) line.ruleAbove = true;
  }
  return lines;
}
