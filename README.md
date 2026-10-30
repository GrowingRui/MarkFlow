# MarkFlow

Converts PDF, Word, PowerPoint, Excel, CSV, HTML, JSON, XML, Jupyter, EPUB, ZIP and image files to Markdown, entirely in the browser. Files are never uploaded: the converters, OCR engine and fonts are all served from the site itself.

## Develop

Requires Node 20 or later.

```sh
npm install
npm run dev        # http://localhost:3000
npm test           # converter tests
npm run build      # production build in dist/
npm run preview    # serve dist/ on http://localhost:3000
```

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Page markup |
| `src/main.js` | Entry point: fonts, styles, UI setup |
| `src/styles.css` | Page styles and Tailwind layers |
| `src/ui/` | Converter panel, result panel, FAQ, language menu |
| `src/convert/` | One module per format. `index.js` picks the converter and loads it on demand |
| `tests/` | Vitest tests; `__snapshots__/` holds the expected Markdown for each fixture |
| `scripts/make-fixtures.mjs` | Builds the sample files in `tests/fixtures/` |

## Changing a converter

1. Add a case to `scripts/make-fixtures.mjs` if the change needs one, then run `npm run fixtures`.
2. Run `npm test`. If the output changed on purpose, review the diff in `tests/__snapshots__/` and accept it with `npx vitest run -u`.

## OCR

Text recognition uses Tesseract.js with English data. `vite.config.js` copies the worker, the WebAssembly core and `eng.traineddata.gz` from `node_modules` into `tesseract/` at build time, so OCR works without a CDN.
