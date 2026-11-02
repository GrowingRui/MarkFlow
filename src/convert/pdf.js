import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadModule } from './errors.js';
import { dropFigureText, markRules, pageGraphics } from './graphics.js';
import { bodySize, dropRunningLines, headingLevels, joinPages, makeLine, pdfBlocks, pdfLayout, pdfLines, renderEmphasis, unbold } from './layout.js';
import { joinBlocks } from './markdown.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function pdfToMd(file, ctx) {
  ctx.progress('Opening PDF…');
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  let textChars = 0, boldChars = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.progress(`Reading page ${n} of ${doc.numPages}…`);
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const chars = items.reduce((sum, it) => sum + it.str.trim().length, 0);
    if (ctx.ocrMode === 'Always' || (ctx.ocrMode === 'Auto' && chars < 20)) {
      const { recognize, ocrItems, ocrTextToMd } = await loadModule(import('./ocr.js'));
      // About 300 DPI, the resolution OCR reads small print best at, with large pages capped at 4000 pixels.
      const [width, height] = [page.view[2] - page.view[0], page.view[3] - page.view[1]];
      const scale = Math.min(4, 4000 / Math.max(width, height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      ctx.progress(`Recognizing text on page ${n} of ${doc.numPages}…`);
      const { blocks, text } = await recognize(canvas, ctx);
      // The words go through the same layout as a text page; plain text only if Tesseract gave no layout.
      const [, bottom, , top] = page.view;
      const scanned = ocrItems(blocks, { scale, bottom, height: canvas.height });
      pages.push(scanned.length ? { lines: pdfLines(scanned), bottom, top, scanned: true } : { ocrText: ocrTextToMd(text) });
    } else {
      // The page's drawing operations give its fonts' names (for bold and italic) and its graphics:
      // rules that mark out tables, and figures whose labels are left out.
      const opList = await page.getOperatorList().catch(() => null);
      const styles = opList ? await fontStyles(page, items) : {};
      for (const it of items) {
        textChars += it.str.length;
        if (styles[it.fontName]?.bold) boldChars += it.str.length;
      }
      const [, bottom, , top] = page.view;
      let lines = pdfLines(items, styles);
      if (opList) {
        const graphics = pageGraphics(opList, pdfjs.OPS, page.view);
        lines = markRules(dropFigureText(lines, graphics.figures, makeLine), graphics);
      }
      pages.push({ lines, bottom, top });
    }
    page.cleanup();
  }
  // In a document set mostly in bold, bold says nothing, so it is left out.
  if (boldChars > textChars / 2) for (const p of pages) for (const l of p.lines || []) unbold(l);
  dropRunningLines(pages.filter(p => p.lines));
  for (const p of pages) if (p.lines) p.lines = pdfLayout(p.lines);
  // Text recognition measures type differently from a PDF's own fonts, so scanned pages and text pages
  // each have their own body text size and heading levels.
  const kinds = new Map([true, false].map(scanned => {
    const lines = pages.filter(p => p.lines && !!p.scanned === scanned).flatMap(p => p.lines);
    const body = bodySize(lines);
    // Recognized sizes vary more, so a scan's headings share a level within 15% rather than 5%.
    return [scanned, { body, levels: headingLevels(lines, body, scanned ? 0.15 : 0.05) }];
  }));
  const blocks = joinPages(pages.map(p => {
    if (!p.lines) return p.ocrText ? [p.ocrText] : [];
    const { body, levels } = kinds.get(!!p.scanned);
    return pdfBlocks(p.lines, body, levels);
  }));
  return joinBlocks(blocks.map(renderEmphasis));
}

// Bold and italic come from the font's name, such as "ABCDEF+Calibri-BoldItalic". PDF.js reports
// names only for fonts it has loaded to draw the page, so this runs after the page's drawing operations
// are read. A font that never arrives counts as plain.
async function fontStyles(page, items) {
  const styles = {};
  for (const id of new Set(items.map(it => it.fontName))) {
    const font = await Promise.race([new Promise(done => page.commonObjs.get(id, done)), new Promise(done => setTimeout(done, 1000))]);
    const name = typeof font?.name === 'string' ? font.name.replace(/^[A-Z]{6}\+/, '') : '';
    const named = fontStyle(name);
    styles[id] = { bold: !!(font?.bold || font?.black) || named.bold, italic: !!font?.italic || named.italic };
  }
  return styles;
}

// Reads the style from a font name. The style is usually the part after a hyphen or comma
// ("Calibri-BoldItalic", "NimbusRomNo9L-Medi", "HelveticaNeueLTStd-BdIt", "Arial,Bold"); TeX's
// Computer Modern fonts encode it in the family instead (CMBX10 is bold, CMTI10 italic).
export function fontStyle(name) {
  const style = name.includes('-') || name.includes(',') ? name.slice(name.search(/[-,]/) + 1) : '';
  return {
    bold: /bold|black|heavy|demi|medi|^bd|bd(it)?$|blk|^bl$/i.test(style) || /bold|^cmbx|^cmb\d/i.test(name),
    italic: /ital|obli|^it$|it$/i.test(style) || /italic|oblique|^cmti|^cmsl/i.test(name),
  };
}
