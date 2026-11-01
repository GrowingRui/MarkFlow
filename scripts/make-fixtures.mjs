// Builds the sample files in tests/fixtures. Run with `npm run fixtures`.
// Every fixture is generated, so a test can be traced back to the exact content that produced it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, ExternalHyperlink } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const dir = join(import.meta.dirname, '..', 'tests', 'fixtures');
mkdirSync(dir, { recursive: true });
const write = (name, data) => writeFileSync(join(dir, name), data);
// Fixed timestamps keep the zip-based files byte-identical between runs.
const date = new Date('2026-01-01T00:00:00Z');

// HTML
const html = `<!DOCTYPE html>
<html><head><title>Release notes</title><style>body { color: red; }</style><script>alert(1)</script></head>
<body>
<h1>Release notes</h1>
<p>Version <strong>2.4</strong> adds <a href="https://example.com/docs">offline docs</a> and <em>faster</em> search.</p>
<h2>Changes</h2>
<ul><li>New export menu</li><li>Fixed a crash when <code>config.json</code> is empty
<ul><li>Affects Windows only</li></ul></li></ul>
<ol start="3"><li>Third step</li><li>Fourth step</li></ol>
<table><tr><th>Plan</th><th>Price</th></tr><tr><td>Free</td><td>0 | none</td></tr><tr><td>Pro</td><td>12</td></tr></table>
<pre><code>npm install markflow</code></pre>
<p><img src="data:image/png;base64,AAAA" alt="Diagram"> <img src="logo.png" alt="Logo"></p>
<noscript>Enable JavaScript</noscript>
</body></html>
`;
write('page.html', html);

// CSV, JSON, XML
write('people.csv', 'Name,Role,Notes\nAda,Engineer,"Likes ""tea"", not coffee"\nGrace,Admiral,\n\nLinus,Maintainer,Pipe | inside\n');
write('config.json', '{"name":"markflow","features":["pdf","docx"],"limits":{"daily":3},"code":"```"}');
write('broken.json', '{"name": "markflow", oops}');
write('feed.xml', '\n<?xml version="1.0"?>\n<feed><entry id="1">First</entry><entry id="2">Second</entry></feed>\n\n');

// Jupyter notebook
write('analysis.ipynb', JSON.stringify({
  metadata: { kernelspec: { language: 'python', name: 'python3' } },
  nbformat: 4,
  cells: [
    { cell_type: 'markdown', source: ['# Analysis\n', '\n', 'Load the data first.'] },
    { cell_type: 'code', source: ['import pandas as pd\n', 'df = pd.read_csv("x.csv")'], outputs: [] },
    { cell_type: 'code', source: 'print("hi")', outputs: [{ output_type: 'stream', name: 'stdout', text: ['hi\n'] }] },
    { cell_type: 'code', source: 'df.shape', outputs: [{ output_type: 'execute_result', data: { 'text/plain': ['(3, 2)'] } }] },
    { cell_type: 'code', source: 'show()', outputs: [{ output_type: 'display_data', data: { 'text/markdown': '**Bold output**', 'text/plain': 'ignored' } }] },
    { cell_type: 'raw', source: 'raw cell text' },
    { cell_type: 'markdown', source: '' },
  ],
}, null, 1));

// Spreadsheets
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Region', 'Q2', 'Q3'], ['EU', 1.2, 1.6], ['US', 2.4, 2.5], [], ['Total', 3.6, 4.1]]), 'Revenue');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Owner', 'Task'], ['Ada', 'Line one\nline two']]), 'Tasks');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Empty');
write('report.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
const single = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(single, XLSX.utils.aoa_to_sheet([['Item', 'Qty'], ['Pens', 4]]), 'Only');
write('single.xls', XLSX.write(single, { type: 'buffer', bookType: 'biff8' }));

// Word
const cell = text => new TableCell({ children: [new Paragraph(text)] });
const docx = new Document({
  creator: 'MarkFlow', title: 'Onboarding', description: 'fixture',
  numbering: { config: [{ reference: 'steps', levels: [{ level: 0, format: 'decimal', text: '%1.' }] }] },
  sections: [{
    children: [
      new Paragraph({ text: 'Onboarding guide', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun('Welcome to the team. Read the '), new ExternalHyperlink({ link: 'https://example.com/handbook', children: [new TextRun({ text: 'handbook', style: 'Hyperlink' })] }), new TextRun(' first.')] }),
      new Paragraph({ text: 'First week', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: 'Bold point', bold: true }), new TextRun(' and '), new TextRun({ text: 'italic point', italics: true })] }),
      new Paragraph({ text: 'Set up your laptop', bullet: { level: 0 } }),
      new Paragraph({ text: 'Install the VPN', bullet: { level: 1 } }),
      new Paragraph({ text: 'Meet your buddy', bullet: { level: 0 } }),
      new Paragraph({ text: 'Sign the contract', numbering: { reference: 'steps', level: 0 } }),
      new Paragraph({ text: 'Collect your badge', numbering: { reference: 'steps', level: 0 } }),
      new Table({ rows: [new TableRow({ children: [cell('Day'), cell('Task')] }), new TableRow({ children: [cell('Monday'), cell('Intro | tour')] })] }),
    ],
  }],
});
write('guide.docx', await rezip(await Packer.toBuffer(docx)));

// PowerPoint
const pptx = new PptxGenJS();
let s = pptx.addSlide();
s.addText('Quarterly review', { placeholder: 'title', x: 0.5, y: 0.5, w: 9, h: 1 });
s.addText('Prepared for the board', { x: 0.5, y: 2, w: 9, h: 1 });
s = pptx.addSlide();
s.addText('Highlights', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 32 });
s.addText([{ text: 'Revenue up 14%', options: { bullet: true } }, { text: 'EU contracts', options: { bullet: true, indentLevel: 1 } }, { text: 'Two new hires', options: { bullet: true } }], { x: 0.5, y: 1.5, w: 9, h: 2 });
s = pptx.addSlide();
s.addTable([[{ text: 'Region' }, { text: 'Q3' }], [{ text: 'EU' }, { text: '1.6M' }]], { x: 0.5, y: 1, w: 6 });
pptx.addSlide();
write('deck.pptx', await rezip(await pptx.write({ outputType: 'nodebuffer' })));

// PDF: a heading, body text with a hyphenated wrap, bullets with a wrapped item, a numbered list and a second page
const pdf = await PDFDocument.create();
pdf.setCreationDate(date);
pdf.setModificationDate(date);
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const ink = rgb(0.1, 0.1, 0.1);
let page = pdf.addPage([612, 792]);
let y = 720;
const line = (text, { size = 11, font = regular, x = 72, gap = 1.4 } = {}) => { page.drawText(text, { x, y, size, font, color: ink }); y -= size * gap; };
line('Quarterly Report', { size: 24, font: bold, gap: 2 });
line('Revenue grew 14% in the third quarter, driven by new con-');
line('tracts in the EU region and steady renewals in the US.');
y -= 12;
line('Customer highlights', { size: 15, font: bold, gap: 1.8 });
line('• Enterprise: 42 accounts across nine countries, most of them');
line('renewing for at least two more years', { x: 84 });
line('• SMB: 310 accounts');
y -= 12;
line('1. Close the EU office lease');
line('2. Hire two support engineers');
y -= 12;
line('Another paragraph that stands on its own after a gap.');
page = pdf.addPage([612, 792]);
y = 720;
line('Next steps', { size: 15, font: bold, gap: 1.8 });
line('The board meets again in January.');
write('report.pdf', await pdf.save({ useObjectStreams: false }));

// PDF layout: a full-width title, two columns with a sentence that carries over, then a table
const layout = await PDFDocument.create();
layout.setCreationDate(date);
layout.setModificationDate(date);
const lRegular = await layout.embedFont(StandardFonts.Helvetica);
const lBold = await layout.embedFont(StandardFonts.HelveticaBold);
const lPage = layout.addPage([612, 792]);
const text = (str, x, top, { size = 10, font = lRegular } = {}) => lPage.drawText(str, { x, y: top, size, font, color: ink });
text('Field notes from the northern sites', 72, 720, { size: 20, font: lBold });
const leftCol = ['The survey covered eleven sites along', 'the river and took most of the spring.', 'Water levels were lower than in any', 'year since records began, which'];
const rightCol = ['changed where the teams could camp.', 'Most sites were reached on foot.', '', 'Two sites were skipped after a storm.'];
leftCol.forEach((s, i) => text(s, 72, 680 - i * 14));
rightCol.forEach((s, i) => s && text(s, 320, 680 - i * 14));
text('Samples collected at each site', 72, 600, { size: 14, font: lBold });
[['Site', 'Samples', 'Status'], ['North bend', '24', 'Done'], ['Mill pond', '18', 'Done'], ['East ford', '9', 'Partial']]
  .forEach((row, i) => row.forEach((cell, j) => text(cell, [72, 260, 400][j], 570 - i * 16, { font: i ? lRegular : lBold })));
text('All samples are stored at the field station until the autumn review.', 72, 490);
write('layout.pdf', await layout.save({ useObjectStreams: false }));

// EPUB
const epub = new JSZip();
epub.file('mimetype', 'application/epub+zip', { date, createFolders: false });
epub.file('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>', { date, createFolders: false });
epub.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="c1" href="text/chapter%201.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/../text/chapter2.xhtml" media-type="application/xhtml+xml"/><item id="blank" href="text/blank.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c2"/><itemref idref="blank"/><itemref idref="c1"/><itemref idref="missing"/></spine></package>', { date, createFolders: false });
epub.file('OEBPS/text/chapter 1.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter one</h1><p>It was a quiet morning.</p></body></html>', { date, createFolders: false });
epub.file('OEBPS/text/chapter2.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Prologue</h1><p>Before it all began.</p></body></html>', { date, createFolders: false });
epub.file('OEBPS/text/blank.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body></body></html>', { date, createFolders: false });
write('book.epub', await epub.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

// ZIP with convertible, unsupported and hidden files
const zip = new JSZip();
zip.file('notes/readme.html', '<h1>Readme</h1><p>Hello.</p>', { date, createFolders: false });
zip.file('data/people.csv', 'Name,Role\nAda,Engineer\n', { date, createFolders: false });
zip.file('data/settings.json', '{"theme":"dark"}', { date, createFolders: false });
zip.file('bin/tool.exe', 'MZ', { date, createFolders: false });
zip.file('bad.json.ipynb', 'not json', { date, createFolders: false });
zip.file('__MACOSX/._readme.html', 'junk', { date, createFolders: false });
zip.file('.DS_Store', 'junk', { date, createFolders: false });
write('bundle.zip', await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

console.log(`Fixtures written to ${dir}`);

// docx and pptxgenjs stamp the current time into their zip entries and document properties;
// repack with a fixed date so regenerating doesn't change the files. (The docx library still gives
// hyperlinks a random relationship id, so guide.docx differs between runs; its text doesn't.)
async function rezip(buffer) {
  const src = await JSZip.loadAsync(buffer);
  const out = new JSZip();
  for (const f of Object.values(src.files)) {
    if (f.dir) continue;
    const data = f.name === 'docProps/core.xml'
      ? (await f.async('string')).replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, date.toISOString().replace('.000', ''))
      : await f.async('uint8array');
    out.file(f.name, data, { date, createFolders: false });
  }
  return out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
