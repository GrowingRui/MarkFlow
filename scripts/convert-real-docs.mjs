// Converts every file in real-docs/ in Chrome, through the dev server (`npm run dev` must be
// running), and writes the Markdown to real-docs/out/<file>.md with the time each one took.
// Pass file names to convert only those.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const dir = join(import.meta.dirname, '..', 'real-docs');
const out = join(dir, 'out');
mkdirSync(out, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter(n => statSync(join(dir, n)).isFile());

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  for (const name of names) {
    const b64 = readFileSync(join(dir, name)).toString('base64');
    const result = await page.evaluate(async (b64, name) => {
      const { convertFile } = await import('/src/convert/index.js');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const start = performance.now();
      try {
        const md = await convertFile(new File([bytes], name), { progress() {}, warn() {}, ocrMode: 'Auto' });
        return { md, ms: Math.round(performance.now() - start) };
      } catch (err) {
        return { error: err.message, ms: Math.round(performance.now() - start) };
      }
    }, b64, name);
    if (result.error) console.log(`${name}: FAILED after ${result.ms} ms: ${result.error}`);
    else {
      writeFileSync(join(out, `${name}.md`), result.md);
      console.log(`${name}: ${result.ms} ms, ${result.md.length} chars`);
    }
  }
} finally {
  await browser.close();
}
