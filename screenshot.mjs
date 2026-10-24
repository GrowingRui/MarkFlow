// Usage: node screenshot.mjs <url> [label] [width]
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const PPTR = process.env.PUPPETEER_PATH ||
  'C:/Users/ASUS/AppData/Local/Temp/claude/c--Users-ASUS-Downloads-MarkFlow/6cd872e9-7dea-426b-9c0a-907a54702135/scratchpad/pptr/node_modules/puppeteer-core';
const puppeteer = require(PPTR);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const [url = 'http://localhost:3000', label, width = '1440'] = process.argv.slice(2);
const dir = './temporary screenshots';
if (!existsSync(dir)) mkdirSync(dir);
const n = readdirSync(dir).filter(f => f.startsWith('screenshot-')).length + 1;
const out = `${dir}/screenshot-${n}${label ? '-' + label : ''}.png`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: Number(width), height: 900 });
await page.goto(url, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
