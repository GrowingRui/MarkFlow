import * as XLSX from 'xlsx';
import { joinBlocks, mdTable } from './markdown.js';

export async function sheetToMd(file, ctx) {
  ctx.progress('Reading spreadsheet…');
  return workbookToMd(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
}

export async function csvToMd(file) {
  const { decodeText } = await import('./encoding.js');
  const text = decodeText(new Uint8Array(await file.arrayBuffer()));
  return workbookToMd(XLSX.read(text, { type: 'string', raw: true }), false);
}

// Spreadsheets (not CSV) keep blank rows inside a table, since they often separate groups such as a
// total, and get a heading per sheet when there are several.
function workbookToMd(wb, spreadsheet = true) {
  return joinBlocks(wb.SheetNames.flatMap(name => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false, blankrows: spreadsheet });
    const table = mdTable(rows, { keepBlankRows: spreadsheet });
    if (!table) return [];
    return spreadsheet && wb.SheetNames.length > 1 ? [`## ${name}`, table] : [table];
  }));
}
