import JSZip from 'jszip';
import { convertFile, extOf, isSupported } from './index.js';

export async function openZip(file) {
  return JSZip.loadAsync(await file.arrayBuffer());
}

export async function zipToMd(file, ctx) {
  const zip = await openZip(file);
  const entries = Object.values(zip.files).filter(f => !f.dir && !/(^|\/)(__MACOSX|\.)/.test(f.name));
  const sections = [];
  const skipped = [];
  for (const [i, entry] of entries.entries()) {
    const name = entry.name.split('/').pop();
    const ext = extOf(name);
    if (!isSupported(ext) || ext === 'zip') { skipped.push(name); continue; }
    ctx.progress(`Converting ${name} (${i + 1} of ${entries.length})…`);
    try {
      const inner = new File([await entry.async('blob')], name);
      sections.push(`## ${entry.name}\n\n${await convertFile(inner, ctx)}`);
    } catch (err) {
      skipped.push(name);
    }
  }
  if (skipped.length) ctx.warn(`Skipped ${skipped.length} file${skipped.length > 1 ? 's' : ''} that couldn’t be converted: ${skipped.join(', ')}.`);
  return sections.join('\n\n');
}
