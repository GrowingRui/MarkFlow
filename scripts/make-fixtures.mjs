// Builds the sample files in tests/fixtures. Run with `npm run fixtures`.
// Every fixture is generated, so a test can be traced back to the exact content that produced it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Document, ExternalHyperlink, HeadingLevel, Math as MathEq, MathFraction, MathRadical, MathRun, MathSuperScript, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

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

// Word with a Title above Heading 1 sections, and equations: inline, with a fraction, a power and a root
const paper = new Document({
  creator: 'MarkFlow', title: 'Optics', description: 'fixture',
  sections: [{
    children: [
      new Paragraph({ text: 'Diffraction notes', heading: HeadingLevel.TITLE }),
      new Paragraph({ text: 'Single slit', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun('For '), new MathEq({ children: [new MathRun('m=1')] }), new TextRun(', the first minimum is at')] }),
      new Paragraph({ children: [new MathEq({ children: [
        new MathRun('sin θ='),
        new MathFraction({ numerator: [new MathRun('mλ')], denominator: [new MathRun('a')] }),
        new MathRun('≈'),
        new MathSuperScript({ children: [new MathRun('10')], superScript: [new MathRun('-4')] }),
      ] })] }),
      new Paragraph({ children: [new TextRun('The width scales with '), new MathEq({ children: [new MathRadical({ children: [new MathRun('L')] })] }), new TextRun('.')] }),
    ],
  }],
});
write('paper.docx', await rezip(await Packer.toBuffer(paper)));

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
// Real placeholders from a master: body text is bulleted unless a paragraph turns its bullet off
pptx.defineSlideMaster({
  title: 'PLAIN',
  objects: [
    { placeholder: { options: { name: 'heading', type: 'title', x: 0.5, y: 0.3, w: 9, h: 0.8 }, text: '' } },
    { placeholder: { options: { name: 'content', type: 'body', x: 0.5, y: 1.3, w: 9, h: 3 }, text: '' } },
  ],
});
s = pptx.addSlide({ masterName: 'PLAIN' });
s.addText('Risks', { placeholder: 'heading' });
s.addText([{ text: 'Supplier delays', options: { breakLine: true } }, { text: 'Two plants affected', options: { indentLevel: 1, breakLine: true } }, { text: 'Mitigation is in the appendix.' }], { placeholder: 'content' });
// Text boxes only: a title that is the largest text, a numbered list with a nested bullet, and a caption
s = pptx.addSlide();
s.addText('Small print at the top', { x: 0.5, y: 0.1, w: 9, h: 0.3, fontSize: 10 });
s.addText('Plan for Q4', { x: 0.5, y: 0.5, w: 9, h: 0.8, fontSize: 28 });
s.addText([
  { text: 'Close the lease', options: { bullet: { type: 'number' } } },
  { text: 'Notice by October', options: { bullet: true, indentLevel: 1 } },
  { text: 'Hire support', options: { bullet: { type: 'number' } } },
], { x: 0.5, y: 1.5, w: 9, h: 2 });
s.addText('Figures are estimates.', { x: 0.5, y: 4, w: 9, h: 0.5, fontSize: 12 });
// pptxgenjs writes <a:buNone/> on every unbulleted paragraph; PowerPoint leaves body placeholder
// paragraphs without bullet settings so they inherit the layout's bullets. Do the same, except on the last one.
const deck = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer' }));
const slide5 = await deck.file('ppt/slides/slide5.xml').async('string');
deck.file('ppt/slides/slide5.xml', slide5.replace(/<a:pPr([^>]*)><a:buNone\/><\/a:pPr>(?=<a:r>(?:(?!<\/a:p>).)*?(Supplier|Two plants))/g, '<a:pPr$1/>'));
write('deck.pptx', await rezip(await deck.generateAsync({ type: 'nodebuffer' })));

// PowerPoint with a chart (two series), speaker notes, and a picture with a description
const charted = new PptxGenJS();
let c = charted.addSlide();
c.addText('Visitors', { placeholder: 'title', x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28 });
c.addChart(charted.ChartType.bar, [
  { name: 'Adults', labels: ['Jan', 'Feb', 'Mar'], values: [120, 95, 140] },
  { name: 'Children', labels: ['Jan', 'Feb', 'Mar'], values: [40, 30, 55] },
], { x: 0.5, y: 1.2, w: 6, h: 3.5, showTitle: true, title: 'Visitors by month' });
c.addNotes('Mention the dip in February.');
c = charted.addSlide();
c.addText('Site map', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28 });
c.addImage({ data: 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', x: 0.5, y: 1.2, w: 2, h: 2, altText: 'Map of the harbour with the visitor centre marked' });
write('charts.pptx', await rezip(await charted.write({ outputType: 'nodebuffer' })));

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

// PDF pages: a running header and "Page N of 3" footer on every page, and paragraphs that run over
// page breaks (one mid-word, one mid-sentence) next to one that ends with its page
const chapter = await PDFDocument.create();
chapter.setCreationDate(date);
chapter.setModificationDate(date);
const cFont = await chapter.embedFont(StandardFonts.Helvetica);
const pageText = [
  ['The river survey began in March, when the first teams set out from the northern', 'station with enough supplies for three weeks and a plan to reach every site be-'],
  ['fore the water rose. Most of them made it back on time.', 'The second season was shorter, and the teams worked closer to the station, which'],
  ['meant less time on the road and more time at each site.', 'A third season is planned for next year.'],
];
pageText.forEach((lines, n) => {
  const pg = chapter.addPage([612, 792]);
  const t = (str, x, y) => pg.drawText(str, { x, y, size: 10, font: cFont, color: ink });
  t('Field Guide - Chapter 2', 72, 760);
  t(`Page ${n + 1} of 3`, 500, 30);
  lines.forEach((str, i) => t(str, 72, 700 - i * 14 - (n === 0 ? 0 : i * 14)));
});
write('chapter.pdf', await chapter.save({ useObjectStreams: false }));

// PDF emphasis: a title only a little larger than the body, bold labels after text on the same line,
// a bold phrase of separate words that wraps onto a second line, and an italic note
const letter = await PDFDocument.create();
letter.setCreationDate(date);
letter.setModificationDate(date);
const eRegular = await letter.embedFont(StandardFonts.Helvetica);
const eBold = await letter.embedFont(StandardFonts.HelveticaBold);
const eItalic = await letter.embedFont(StandardFonts.HelveticaOblique);
const ePage = letter.addPage([595, 842]);
const put = (str, x, y, font = eRegular, size = 12) => ePage.drawText(str, { x, y, size, font, color: ink });
put('Sample cover letter', 230, 760, eBold, 14);
put('Subject: Application for the [Role] position', 85, 710);
put('[SUBJECT]', 420, 710, eBold);
put('Dear [Name],', 85, 662);
put('[GREETING]', 420, 662, eBold);
put('I am writing to apply for the [Role] position at [Company], as advertised on your', 85, 614);
put('website. My experience matches the requirements in the description.', 85, 598);
put('[INTRODUCTION AND MOTIVATION]', 220, 574, eBold);
['[EVERYTHING', 'ABOUT', 'YOU:', 'SKILLS', 'AND'].reduce((x, word) => (put(word, x, 526, eBold), x + eBold.widthOfTextAtSize(word + ' ', 12)), 85);
put('ACHIEVEMENTS]', 85, 510, eBold);
put('Best regards,', 85, 462);
put('[SIGNING OFF]', 400, 438, eBold);
put('[Your name]', 85, 414);
put('Attach your CV as a PDF.', 85, 366, eItalic);
write('letter.pdf', await letter.save({ useObjectStreams: false }));

// PDF short lines: a receipt in Courier with a centred address, label lines, ===== dividers, a wrapped
// item name that runs to the edge, a numbered item wrapping without an indent, a contents line with
// dot leaders, and a sideways stamp in the margin
const receipt = await PDFDocument.create();
receipt.setCreationDate(date);
receipt.setModificationDate(date);
const mono = await receipt.embedFont(StandardFonts.Courier);
const monoBold = await receipt.embedFont(StandardFonts.CourierBold);
const rPage = receipt.addPage([300, 520]);
const rLine = (str, x, y, font = mono, size = 9) => rPage.drawText(str, { x, y, size, font, color: ink });
const centre = (str, y, font = mono, size = 9) => rLine(str, (300 - font.widthOfTextAtSize(str, size)) / 2, y, font, size);
centre('CORNER BOOKS', 480, monoBold, 12);
centre('12 Harbour Street', 464);
centre('Bristol BS1 4QA', 453);
rLine('=========================================', 20, 438);
rLine('Order: ORD-2041', 20, 424);
rLine('Cashier: Priya', 20, 413);
rLine('=========================================', 20, 399);
rLine('Field Guide to Coastal Birds and Their', 20, 385);
rLine('Habitats', 20, 374);
rLine('1 @ 18.50', 20, 363);
rLine('1. Keep this receipt for returns within', 20, 345);
rLine('thirty days of purchase.', 20, 334);
rLine('Contents . . . . . . . . . . . . . . . . 2', 20, 316);
rLine('Thank you for visiting!', 20, 298);
rPage.drawText('COPY - NOT A TAX INVOICE', { x: 290, y: 60, size: 8, font: mono, color: ink, rotate: degrees(90) });
write('receipt.pdf', await receipt.save({ useObjectStreams: false }));

// PDF form: a title with a date beside it, label/value pairs in two columns and in one column (values
// longer than their labels), and a wide schedule whose rows cross the gap between the label and value
// columns, with a note under each title that runs wider than its column
const form = await PDFDocument.create();
form.setCreationDate(date);
form.setModificationDate(date);
const fRegular = await form.embedFont(StandardFonts.Helvetica);
const fBold = await form.embedFont(StandardFonts.HelveticaBold);
const fPage = form.addPage([612, 792]);
const fText = (str, x, y, size = 8, font = fRegular) => fPage.drawText(str, { x, y, size, font, color: ink });
fText('BOOKING ORDER', 50, 740, 16, fBold);
fText('Print Date 12/15/2024', 470, 740);
fText('Orders', 50, 700, 10, fBold);
[['Order / Rev:', '2024-12-5678', 'Cinema:', 'Downtown Multiplex'], ['Alt Order #:', 'SC-WINTER-2024', 'Location:', 'NYC-01'], ['Order Type:', 'Premium Package', 'Region:', 'NORTHEAST']]
  .forEach((row, i) => row.forEach((cell, j) => fText(cell, [50, 150, 350, 450][j], 685 - i * 12)));
fText('Customer', 50, 630, 10, fBold);
[['Name:', 'Universal Studios Distribution'], ['Category:', 'Film Distributor'], ['Contact Email:', 'bookings@universalstudios.com']]
  .forEach(([label, value], i) => { fText(label, 50, 615 - i * 12); fText(value, 150, 615 - i * 12); });
fText('Show Schedule', 50, 560, 10, fBold);
const cols = [50, 70, 100, 140, 180, 260, 300, 350];
['Ln', 'Screen', 'Start', 'End', 'Movie Title', 'Format', 'Showtime', 'Total'].forEach((h, j) => fText(h, cols[j], 545, 7));
[['1', 'SCR-1', '12/20/24', '12/25/24', 'Holiday Spectacular', 'IMAX 3D', '7:00 PM', '$3,000', '(Runtime: 142 min); Holiday Season Premium'],
  ['2', 'SCR-2', '12/20/24', '12/31/24', 'Winter Wonderland', 'Standard', '4:30 PM', '$3,600', '(Runtime: 98 min); Matinee Special']]
  .forEach((row, i) => {
    row.slice(0, 8).forEach((cell, j) => fText(cell, cols[j], 533 - i * 22, 7));
    fText(row[8], 180, 524 - i * 22, 6);
  });
fText('All showtimes are approximate and subject to change.', 50, 470);
write('form.pdf', await form.save({ useObjectStreams: false }));

// CSV saved by a Chinese version of Excel, in GBK rather than UTF-8:
// 姓名,城市 / 张伟,北京 / 李娜,上海
write('chinese-gbk.csv', Buffer.from('d0d5c3fb2cb3c7cad00ad5c5ceb02cb1b1bea90ac0eec4c82cc9cfbaa30a', 'hex'));

// A web page saved from a site: menus outside <main>, navigation inside it, links relative to the
// canonical address, and a link that only runs a script
write('article.html', `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tide tables</title><link rel="canonical" href="https://example.com/guides/tides"></head>
<body>
<header><nav><a href="/">Home</a> <a href="/guides">Guides</a></nav></header>
<main>
<nav class="breadcrumbs"><a href="/guides">Guides</a> › Tides</nav>
<h1>Reading tide tables</h1>
<p>High water comes about twice a day. See <a href="moon">how the moon matters</a> or <a href="javascript:void(0)">print this page</a>.</p>
<img src="/img/chart.png" alt="Tide chart">
</main>
<footer>© Example Guides</footer>
</body></html>
`);

// News feeds: RSS with HTML descriptions, and Atom with an entry's link given as an attribute
write('news.xml', `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Harbour News</title><description>Updates from the harbour office</description>
<item><title>New mooring fees</title><link>https://example.com/fees</link><pubDate>Mon, 05 Jan 2026 09:00:00 +0000</pubDate>
<description>&lt;p&gt;Fees rise by &lt;strong&gt;4%&lt;/strong&gt; from March.&lt;/p&gt;</description></item>
<item><title>Dredging finished</title><description>The east channel is open again.</description></item>
</channel></rss>
`);
write('updates.atom.xml', `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Lighthouse log</title>
<entry><title>Lamp replaced</title><link href="https://example.com/lamp" rel="alternate"/><updated>2026-01-02T10:00:00Z</updated><summary>The new lamp is brighter.</summary></entry>
</feed>
`);

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
// hyperlinks a random relationship id, so guide.docx differs between runs, and pptxgenjs does the same
// for charts.pptx; their text doesn't.)
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
