// The hero converter: pick, drop or fetch files, convert them one at a time, and hand the Markdown to the result sheet.
import { convertFile, extOf, fail, isSupported } from '../convert/index.js';
import { startResults, updateResult } from './result.js';
import { conversionsLeft, countConversion, limitMessage } from './account.js';

// Used to name a file fetched from a URL that has no recognisable extension.
const MIME_EXT = { 'application/pdf': 'pdf', 'text/html': 'html', 'application/json': 'json', 'text/csv': 'csv', 'application/xml': 'xml', 'text/xml': 'xml', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function reasonFor(err, file) {
  return err.friendly ? err.message : `The file may be damaged, or it isn’t really a .${extOf(file.name)} file.`;
}

export function initConverter() {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('fileInput');
  const convertBtn = document.getElementById('convertBtn');
  const msg = document.getElementById('convertMsg');
  let current = [];
  let busy = false;

  function status(text) {
    msg.textContent = text;
    msg.classList.toggle('hidden', !text);
  }
  function setButton() {
    convertBtn.disabled = busy || !current.length;
    convertBtn.firstElementChild.textContent = busy ? 'Converting…'
      : current.length > 1 ? `Convert ${current.length} files` : 'Convert';
  }
  // Warns up front when today's remaining conversions won't cover every file.
  function quotaNote() {
    const left = conversionsLeft();
    if (current.length < 2 || left >= current.length) return '';
    if (left === 0) return limitMessage() ?? '';
    return `You have ${plural(left, 'conversion')} left today, so only the first ${left} will be converted.`;
  }
  function pick(files, sub) {
    if (!files.length) return;
    current = files;
    const total = files.reduce((sum, f) => sum + f.size, 0);
    const change = files.length > 1 ? 'Click to choose different files.' : 'Click to choose a different file.';
    document.getElementById('dzTitle').textContent = files.length > 1 ? `${files.length} files` : files[0].name;
    document.getElementById('dzSub').textContent = sub ?? `${formatSize(total)}${files.length > 1 ? ' in total' : ''}. ${change}`;
    dz.title = files.length > 1 ? files.map(f => f.name).join('\n') : '';
    setButton();
    status(quotaNote());
  }

  // Upload
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { pick([...input.files]); input.value = ''; });
  ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => pick([...e.dataTransfer.files]));

  // Fetch from URL. Only works when the other site allows cross-origin downloads.
  document.getElementById('urlForm').addEventListener('submit', async e => {
    e.preventDefault();
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    if (!url) { urlInput.focus(); return; }
    status('Downloading file…');
    try {
      const res = await fetch(url);
      if (!res.ok) throw fail(`The server responded with status ${res.status}.`);
      const blob = await res.blob();
      const type = blob.type.split(';')[0];
      let name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || new URL(url).hostname;
      if (!extOf(name) || !isSupported(extOf(name))) name += '.' + (MIME_EXT[type] || 'html');
      pick([new File([blob], name, { type })], `${formatSize(blob.size)}, downloaded from URL.`);
    } catch (err) {
      status(err instanceof TypeError
        ? 'That site doesn’t allow downloads from other websites. Download the file yourself, then upload it above.'
        : `Couldn’t download the file. ${err.message}`);
    }
  });

  async function convertOne(file, i, progress) {
    const warnings = [];
    const ctx = { progress, warn: w => warnings.push(w), ocrMode: document.getElementById('ocr').value };
    const md = await convertFile(file, ctx);
    if (!md.trim()) throw fail('No readable text was found in this file.');
    updateResult(i, { state: 'done', md, note: '' });
    await countConversion();
    return warnings;
  }

  async function convertSingle(file) {
    try {
      const warnings = await convertOne(file, 0, status);
      status(warnings.join(' '));
    } catch (err) {
      console.error(err);
      status(`Couldn’t convert ${file.name}. ${reasonFor(err, file)}`);
    }
  }

  async function convertBatch(files) {
    let converted = 0, failed = 0, limited = null;
    for (const [i, file] of files.entries()) {
      limited ??= limitMessage();
      if (limited) { updateResult(i, { state: 'failed', note: 'Not converted. Today’s limit is used up.' }); continue; }
      status(`Converting ${file.name} (${i + 1} of ${files.length})…`);
      updateResult(i, { state: 'converting', note: '' });
      try {
        await convertOne(file, i, text => updateResult(i, { note: text }));
        converted++;
      } catch (err) {
        console.error(err);
        failed++;
        updateResult(i, { state: 'failed', note: reasonFor(err, file) });
      }
    }
    const summary = [`Converted ${converted} of ${plural(files.length, 'file')}.`];
    if (failed) summary.push(`${plural(failed, 'file')} couldn’t be converted.`);
    if (limited) summary.push(limited);
    status(summary.join(' '));
  }

  // Conversion
  convertBtn.addEventListener('click', async () => {
    if (!current.length || busy) return;
    const limited = limitMessage();
    if (limited) { status(limited); return; }
    busy = true;
    setButton();
    const files = current;
    startResults(files.map(f => f.name));
    try {
      await (files.length > 1 ? convertBatch(files) : convertSingle(files[0]));
    } finally {
      busy = false;
      setButton();
    }
  });
}
