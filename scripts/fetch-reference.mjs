// Converts each file in tests/fixtures on markitdown.online and saves its Markdown to
// tests/reference/<file>.md, so our output can be compared with theirs. Only the generated
// fixtures are uploaded, never real documents. Run with `npm run reference [file ...]`.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = join(import.meta.dirname, '..');
const fixtures = join(root, 'tests', 'fixtures');
const out = join(root, 'tests', 'reference');
mkdirSync(out, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(fixtures);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const name of names) {
    const page = await browser.newPage();
    await page.goto('https://markitdown.online/es', { waitUntil: 'networkidle2', timeout: 60000 });
    await (await page.$('input[type=file]')).uploadFile(join(fixtures, name));
    await sleep(1000);
    const [convert] = await page.$$('xpath/.//button[contains(., "Convertir")]');
    await convert.click();
    // The result is done when the output block has stopped changing for a few seconds.
    let text = null, stable = 0;
    for (let t = 0; t < 60 && stable < 3; t++) {
      await sleep(1000);
      const now = await page.evaluate(() => document.querySelector('pre')?.textContent ?? null);
      stable = now !== null && now === text ? stable + 1 : 0;
      text = now;
    }
    if (text === null) {
      const message = await page.evaluate(() => document.querySelector('[role=alert], .text-destructive, [class*=error]')?.textContent?.trim() || 'no output');
      console.log(`${name}: ${message}`);
    } else {
      writeFileSync(join(out, `${name}.md`), text.replace(/\r\n/g, '\n').trim() + '\n');
      console.log(`${name}: saved`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
