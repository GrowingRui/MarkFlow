import * as XLSX from 'xlsx';
import { joinBlocks, mdTable } from './markdown.js';

export async function sheetToMd(file, ctx) {
  ctx.progress('Reading spreadsheet…');
  return workbookToMd(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
}

export async function csvToMd(file) {
  return workbookToMd(XLSX.read(await file.text(), { type: 'string', raw: true }), false);
}

function workbookToMd(wb, headings = true) {
  return joinBlocks(wb.SheetNames.flatMap(name => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false });
    const table = mdTable(rows);
    if (!table) return [];
    return headings && wb.SheetNames.length > 1 ? [`## ${name}`, table] : [table];
  }));
}
