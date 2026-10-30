// The hero converter: pick or fetch a file, convert it, and hand the Markdown to the result panel.
import { convertFile, extOf, fail, isSupported } from '../convert/index.js';
import { showResult } from './result.js';

// Used to name a file fetched from a URL that has no recognisable extension.
const MIME_EXT = { 'application/pdf': 'pdf', 'text/html': 'html', 'application/json': 'json', 'text/csv': 'csv', 'application/xml': 'xml', 'text/xml': 'xml', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initConverter() {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('fileInput');
  const convertBtn = document.getElementById('convertBtn');
  const msg = document.getElementById('convertMsg');
  let current = null;
  let busy = false;

  function status(text) {
    msg.textContent = text;
    msg.classList.toggle('hidden', !text);
  }
  function pick(file) {
    if (!file) return;
    current = file;
    document.getElementById('dzTitle').textContent = file.name;
    document.getElementById('dzSub').textContent = `${formatSize(file.size)}. Click to choose a different file.`;
    convertBtn.disabled = busy;
    status('');
  }

  // Upload
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { pick(input.files[0]); input.value = ''; });
  ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => pick(e.dataTransfer.files[0]));

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
      pick(new File([blob], name, { type }));
      document.getElementById('dzSub').textContent = `${formatSize(blob.size)}, downloaded from URL.`;
    } catch (err) {
      status(err instanceof TypeError
        ? 'That site doesn’t allow downloads from other websites. Download the file yourself, then upload it above.'
        : `Couldn’t download the file. ${err.message}`);
    }
  });

  // Conversion
  convertBtn.addEventListener('click', async () => {
    if (!current || busy) return;
    busy = true;
    convertBtn.disabled = true;
    convertBtn.firstElementChild.textContent = 'Converting…';
    const warnings = [];
    const ctx = { progress: status, warn: w => warnings.push(w), ocrMode: document.getElementById('ocr').value };
    try {
      const md = await convertFile(current, ctx);
      if (!md.trim()) throw fail('No readable text was found in this file.');
      showResult(md, current.name);
      status(warnings.length ? warnings.join(' ') : '');
    } catch (err) {
      console.error(err);
      const reason = err.friendly ? err.message : `The file may be damaged, or it isn’t really a .${extOf(current.name)} file.`;
      status(`Couldn’t convert ${current.name}. ${reason}`);
    } finally {
      busy = false;
      convertBtn.disabled = false;
      convertBtn.firstElementChild.textContent = 'Convert';
    }
  });
}
