// The result sheet: rendered preview, editable Markdown source, copy and download.
// A batch adds a file list beside the preview and a ZIP download of every converted file.
import { loadModule } from '../convert/errors.js';

const result = document.getElementById('result');
const body = document.getElementById('resultBody');
const list = document.getElementById('batchList');
const title = document.getElementById('resultTitle');
const output = document.getElementById('mdOutput');
const preview = document.getElementById('previewPane');
const meta = document.getElementById('resultMeta');
const downloadBtn = document.getElementById('downloadBtn');
const zipBtn = document.getElementById('zipBtn');
const copyBtn = document.getElementById('copyBtn');
const tabs = { preview: document.getElementById('tabPreview'), source: document.getElementById('tabSource') };
const BATCH_COLUMNS = 'lg:grid-cols-[280px_minmax(0,1fr)]';

// { name, outName, state: 'waiting' | 'converting' | 'done' | 'failed', md, note }
let items = [];
let selected = -1;

const countWords = md => (md.match(/[\p{L}\p{N}]+/gu) || []).length;
const isBatch = () => items.length > 1;

// Gives every output file its own name, so the ZIP never holds two report.md files.
function outNames(names) {
  const taken = new Set();
  return names.map(name => {
    const base = name.replace(/\.[^.]+$/, '') || 'markflow';
    let out = `${base}.md`;
    for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${base} (${n}).md`;
    taken.add(out.toLowerCase());
    return out;
  });
}

const ICONS = {
  waiting: '<circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/>',
  converting: '<path d="M12 5a7 7 0 1 1-7 7"/>',
  done: '<path d="m5 12 5 5 9-10"/>',
  failed: '<path d="M12 7v6M12 17h.01"/>',
};

function statusText(item) {
  if (item.state === 'waiting') return 'Waiting';
  if (item.state === 'converting') return item.note || 'Converting…';
  if (item.state === 'done') return `${countWords(item.md).toLocaleString()} words`;
  return item.note;
}

function renderList() {
  list.innerHTML = '';
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <button type="button" class="batch-item flex w-full items-start gap-3 rounded-[4px] px-3 py-2.5 text-left">
        <svg class="batch-icon mt-[3px] h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>
        <span class="min-w-0 flex-1">
          <span class="batch-name block truncate text-[14px] font-semibold text-navy"></span>
          <span class="batch-note block text-[13px] leading-[1.5]"></span>
        </span>
      </button>`;
    li.querySelector('.batch-name').textContent = item.name;
    li.querySelector('button').addEventListener('click', () => select(i));
    list.append(li);
    renderRow(i);
  });
}

function renderRow(i) {
  const item = items[i];
  const btn = list.children[i]?.firstElementChild;
  if (!btn) return;
  btn.dataset.state = item.state;
  btn.disabled = item.state !== 'done';
  btn.setAttribute('aria-current', String(i === selected));
  btn.querySelector('.batch-icon').innerHTML = ICONS[item.state];
  btn.querySelector('.batch-note').textContent = statusText(item);
}

async function renderPreview() {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([
    loadModule(import('marked')),
    loadModule(import('dompurify')),
  ]);
  preview.innerHTML = DOMPurify.sanitize(marked.parse(output.value, { gfm: true }));
  const item = items[selected];
  if (item) meta.textContent = `${item.outName}, ${countWords(output.value).toLocaleString()} words`;
}

function refreshPreview() {
  renderPreview().catch(() => { preview.textContent = 'The preview couldn’t load. Your Markdown is ready in the Markdown tab.'; });
}

function select(i) {
  const previous = selected;
  selected = i;
  output.value = items[i].md;
  if (previous !== -1) renderRow(previous);
  renderRow(i);
  refreshPreview();
  updateActions();
}

function updateActions() {
  const done = items.filter(item => item.state === 'done').length;
  copyBtn.disabled = downloadBtn.disabled = selected === -1;
  zipBtn.classList.toggle('hidden', !isBatch());
  // In a batch the ZIP is the main download, so the single-file one steps back to an outline.
  downloadBtn.classList.toggle('btn-primary', !isBatch());
  downloadBtn.classList.toggle('btn-ghost', isBatch());
  zipBtn.disabled = done < 2;
  zipBtn.textContent = done > 1 ? `Download all ${done} (.zip)` : 'Download all (.zip)';
}

// Opens the sheet for a new set of files. Nothing is shown in the preview until the first file is done.
export function startResults(names) {
  items = outNames(names).map((outName, i) => ({ name: names[i], outName, state: 'waiting', md: '', note: '' }));
  selected = -1;
  output.value = '';
  preview.textContent = isBatch() ? 'Your first file will appear here when it’s converted.' : '';
  meta.textContent = '';
  title.textContent = isBatch() ? 'Your Markdown files' : 'Your Markdown';
  list.classList.toggle('hidden', !isBatch());
  body.classList.toggle(BATCH_COLUMNS, isBatch());
  renderList();
  updateActions();
  // A batch shows its progress list straight away; a single file appears once it's converted.
  result.hidden = true;
  if (isBatch()) reveal();
}

function reveal() {
  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function updateResult(i, patch) {
  Object.assign(items[i], patch);
  // Show the first finished file; after that, leave the person on whichever file they picked.
  if (patch.state === 'done' && selected === -1) {
    select(i);
    if (result.hidden) reveal();
  } else {
    renderRow(i);
  }
  updateActions();
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function downloadZip() {
  const label = zipBtn.textContent;
  zipBtn.disabled = true;
  zipBtn.textContent = 'Packing…';
  try {
    const { default: JSZip } = await loadModule(import('jszip'));
    const zip = new JSZip();
    for (const item of items) if (item.state === 'done') zip.file(item.outName, item.md);
    download(await zip.generateAsync({ type: 'blob' }), 'markflow.zip');
    zipBtn.textContent = label;
  } catch {
    zipBtn.textContent = 'Couldn’t pack the ZIP';
    setTimeout(() => { zipBtn.textContent = label; }, 2400);
  } finally {
    zipBtn.disabled = false;
  }
}

function selectTab(name) {
  for (const [key, tab] of Object.entries(tabs)) tab.setAttribute('aria-selected', key === name);
  preview.classList.toggle('hidden', name !== 'preview');
  output.classList.toggle('hidden', name !== 'source');
}

export function initResult() {
  let previewTimer;
  output.addEventListener('input', () => {
    // Keep edits with their file, so switching files or downloading the ZIP doesn't lose them.
    if (items[selected]) items[selected].md = output.value;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 250);
  });

  tabs.preview.addEventListener('click', () => selectTab('preview'));
  tabs.source.addEventListener('click', () => selectTab('source'));
  document.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = tabs.preview.getAttribute('aria-selected') === 'true' ? 'source' : 'preview';
    selectTab(next);
    tabs[next].focus();
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      copyBtn.textContent = 'Copied';
    } catch {
      output.select();
      copyBtn.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
  });
  downloadBtn.addEventListener('click', () => {
    const item = items[selected];
    if (item) download(new Blob([output.value], { type: 'text/markdown;charset=utf-8' }), item.outName);
  });
  zipBtn.addEventListener('click', downloadZip);
}
