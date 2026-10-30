// The result sheet: rendered preview, editable Markdown source, copy and download.
import { loadModule } from '../convert/errors.js';

const result = document.getElementById('result');
const output = document.getElementById('mdOutput');
const preview = document.getElementById('previewPane');
const meta = document.getElementById('resultMeta');
const tabs = { preview: document.getElementById('tabPreview'), source: document.getElementById('tabSource') };
let outName = 'markflow.md';

async function renderPreview() {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([
    loadModule(import('marked')),
    loadModule(import('dompurify')),
  ]);
  preview.innerHTML = DOMPurify.sanitize(marked.parse(output.value, { gfm: true }));
  const words = (output.value.match(/[\p{L}\p{N}]+/gu) || []).length;
  meta.textContent = `${outName}, ${words.toLocaleString()} words`;
}

export function showResult(md, sourceName) {
  outName = sourceName.replace(/\.[^.]+$/, '') + '.md';
  output.value = md;
  result.hidden = false;
  renderPreview().catch(() => { preview.textContent = 'The preview couldn’t load. Your Markdown is ready in the Markdown tab.'; });
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function selectTab(name) {
  for (const [key, tab] of Object.entries(tabs)) tab.setAttribute('aria-selected', key === name);
  preview.classList.toggle('hidden', name !== 'preview');
  output.classList.toggle('hidden', name !== 'source');
}

export function initResult() {
  let previewTimer;
  output.addEventListener('input', () => { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 250); });

  tabs.preview.addEventListener('click', () => selectTab('preview'));
  tabs.source.addEventListener('click', () => selectTab('source'));
  document.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = tabs.preview.getAttribute('aria-selected') === 'true' ? 'source' : 'preview';
    selectTab(next);
    tabs[next].focus();
  });

  const copyBtn = document.getElementById('copyBtn');
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
  document.getElementById('downloadBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([output.value], { type: 'text/markdown;charset=utf-8' }));
    a.download = outName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
