// Downloads public real-world documents into real-docs/ (ignored by git) for checking conversion
// quality beyond the generated fixtures. Run with `npm run real-docs`; files already there are kept.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKITDOWN = 'https://raw.githubusercontent.com/microsoft/markitdown/main/packages/markitdown/tests/test_files/';
// [saved name, URL]. MarkItDown's test files are MIT-licensed; the rest are US government or arXiv documents.
const DOCS = [
  ...[
    'MEDRPT-2024-PAT-3847_medical_report_scan.pdf', 'RECEIPT-2024-TXN-98765_retail_purchase.pdf',
    'REPAIR-2022-INV-001_multipage.pdf', 'SPARSE-2024-INV-1234_borderless_table.pdf',
    'masterformat_partial_numbering.pdf', 'movie-theater-booking-2024.pdf', 'pdf_cleanup_form.pdf',
    'pdf_cleanup_mixed.pdf', 'pdf_cleanup_plain.pdf', 'test.pdf',
    'test.docx', 'equations.docx', 'rlink.docx', 'test_with_comment.docx',
    'test.pptx', 'test.xlsx', 'test.xls', 'test_mskanji.csv',
    'test_blog.html', 'test_wikipedia.html', 'test_serp.html', 'test.epub', 'test_notebook.ipynb',
    'test_rss.xml', 'json_late_non_ascii.json', 'test_files.zip', 'test.jpg', 'test_llm.jpg',
  ].map(name => [name, MARKITDOWN + name]),
  ['irs-form-w9.pdf', 'https://www.irs.gov/pub/irs-pdf/fw9.pdf'],
  ['irs-pub-501.pdf', 'https://www.irs.gov/pub/irs-pdf/p501.pdf'],
  ['fomc-minutes-2024-01.pdf', 'https://www.federalreserve.gov/monetarypolicy/files/fomcminutes20240131.pdf'],
  ['arxiv-resnet-two-column.pdf', 'https://arxiv.org/pdf/1512.03385'],
  ['arxiv-attention.pdf', 'https://arxiv.org/pdf/1706.03762'],
];

const dir = join(import.meta.dirname, '..', 'real-docs');
mkdirSync(dir, { recursive: true });
for (const [name, url] of DOCS) {
  const path = join(dir, name);
  if (existsSync(path)) continue;
  const res = await fetch(url);
  if (!res.ok) { console.log(`${name}: HTTP ${res.status}`); continue; }
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  console.log(`${name}: saved`);
}
