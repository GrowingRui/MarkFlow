// Converts every file in tests/fixtures and compares the result with tests/__snapshots__/<file>.md.
// After an intended change, review the diff and run `npx vitest run -u` to accept it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { convertFile } from '../src/convert/index.js';

const dir = join(import.meta.dirname, 'fixtures');
const fixture = name => new File([readFileSync(join(dir, name))], name);
async function run(file, ocrMode = 'Off') {
  const progress = [];
  const warnings = [];
  const md = await convertFile(file, { progress: t => progress.push(t), warn: w => warnings.push(w), ocrMode });
  return { md, progress, warnings };
}

describe('fixtures', () => {
  for (const name of readdirSync(dir)) {
    it(name, async () => {
      const { md } = await run(fixture(name));
      await expect(md).toMatchFileSnapshot(`__snapshots__/${name}.md`);
    });
  }
});

describe('convertFile', () => {
  it('reports files it skipped inside a ZIP', async () => {
    const { warnings, progress } = await run(fixture('bundle.zip'));
    expect(warnings).toEqual(['Skipped 2 files that couldn’t be converted: tool.exe, bad.json.ipynb.']);
    expect(progress).toContain('Converting readme.html (1 of 5)…');
  });

  it('rejects unsupported types with a message for the user', async () => {
    await expect(run(new File(['x'], 'notes.txt'))).rejects.toMatchObject({
      friendly: true,
      message: expect.stringMatching(/^\.txt files aren’t supported\. Use PDF, DOCX/),
    });
    await expect(run(new File(['x'], 'README'))).rejects.toMatchObject({
      friendly: true,
      message: expect.stringMatching(/^Files without an extension aren’t supported\./),
    });
  });

  it('matches extensions case-insensitively and ignores inherited object keys', async () => {
    expect((await run(new File(['{"a":1}'], 'DATA.JSON'))).md).toBe('```json\n{\n  "a": 1\n}\n```\n');
    await expect(run(new File(['x'], 'x.constructor'))).rejects.toMatchObject({ friendly: true });
  });

  it('collapses runs of blank lines and ends with one newline', async () => {
    const { md } = await run(new File(['<p>a</p><br><br><br><br><p>b</p>'], 'x.html'));
    expect(md).not.toMatch(/\n{3,}/);
    expect(md.endsWith('b\n')).toBe(true);
  });

  it('explains an EPUB without a package file', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', '<container><rootfiles/></container>');
    const file = new File([await zip.generateAsync({ type: 'uint8array' })], 'broken.epub');
    await expect(run(file)).rejects.toMatchObject({ friendly: true, message: 'This EPUB is missing its table of contents.' });
  });
});
