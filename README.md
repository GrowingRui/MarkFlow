<p align="center">
  <img src="assets/markflow-logo.png" alt="MarkFlow" width="280">
</p>

<p align="center"><strong>Paper in. Markdown out.</strong></p>

MarkFlow is a website that turns PDFs, Office documents, web pages and other files into clean, structured Markdown. You drop in a file and get back Markdown with the headings, lists and tables intact, ready for your docs, a Git repository or an AI agent.

Conversion runs entirely in your browser. Files are never uploaded: the converters, the OCR engine and the fonts are all served from the site itself, so your documents stay on your device.

## Why Markdown

Copying text out of a PDF or a slide deck breaks it: lines split mid-sentence, bullets turn into stray symbols, and tables collapse into one row of numbers. Markdown keeps the structure as plain text that people, Git and AI tools can all read.

- **AI tools read it cleanly.** An agent gets the structure without layout, images or proprietary formatting in the way.
- **Your knowledge leaves the app.** Notes and procedures locked in DOCX, PPTX or XLSX become text you can review, version and reuse.
- **No cleanup by hand.** Headings, lists, tables and code blocks come through, so you don't rebuild them line by line.

## How it works

1. **Add your file.** Drop it on the page, pick it from your computer, or paste a link to it.
2. **Convert.** MarkFlow reads the text, headings, lists and tables and writes them as Markdown.
3. **Check the preview.** See the formatted result, or switch to the Markdown view and fix anything by hand.
4. **Copy or download.** Copy the text, download the `.md` file, or download every result together as a ZIP.

## What each file becomes

| Format | Output |
| --- | --- |
| **PDF** (`.pdf`) | Headings ranked by font size, bold and italic, lists and paragraphs. Multi-column pages are read in order, paragraphs are joined across page breaks, and running headers, footers and page numbers are dropped. Tables are rebuilt from ruled lines and aligned columns. Scanned pages are read with OCR. |
| **Word** (`.docx`) | Headings, lists, links and tables. Equations become LaTeX (`$…$`). |
| **PowerPoint** (`.pptx`) | A section per slide with its title, bullets and numbering at their original indent, tables, chart data, picture alt text and speaker notes. |
| **Excel and CSV** (`.xlsx`, `.xls`, `.csv`) | A Markdown table for each sheet. CSV files saved in other encodings (such as GBK or Shift-JIS) are detected and decoded. |
| **Web pages** (`.html`, `.htm`) | The page content, without scripts and styles. |
| **Jupyter** (`.ipynb`) | Text cells as Markdown; code and outputs as code blocks. |
| **JSON and XML** (`.json`, `.xml`) | Formatted code blocks. RSS and Atom feeds become a list of posts with links, dates and text. |
| **EPUB** (`.epub`) | Every chapter, in reading order. |
| **ZIP** (`.zip`) | Each file inside converted, one section per file. |
| **Images** (`.png`, `.jpg`, `.jpeg`, `.webp`) | The text in the image, read with OCR, including tables, headings and lists. |

Output is GitHub-flavored Markdown, which works in most editors, documentation tools and Git hosts.

## Features

- **Private by design.** Everything runs in the browser, with no CDN scripts or fonts. The server never sees file contents.
- **Batch conversion.** Drop several files at once, or a ZIP, and download all the Markdown together.
- **Convert from a URL.** Paste a link to a file to fetch and convert it (when the other site allows cross-origin downloads).
- **OCR for scans.** Text recognition for image files and PDFs that are pictures of pages, set to *Auto*, *Always* or *Off*.
- **Preview and edit.** Switch between the rendered preview and the raw Markdown before you copy or download.
- **English and German interface.**
- **Free to use.** 5 conversions a day without an account, 30 a day with a free account. The account only counts conversions; files still never leave your browser.

## What people use it for

- Giving AI agents and RAG systems well-structured context
- Turning procedures and product notes into prompts, skills and agent instructions
- Keeping documentation in Git, where plain text is easy to diff and review
- Moving an old DOCX, PDF and slide knowledge base into a Markdown wiki
- Making documents easy to index, search and embed
- Converting files without installing anything or using a command line

---

## Develop

Requires Node 20 or later.

```sh
npm install
npm run dev        # http://localhost:3000, with the API on /api
npm test           # converter tests
npm run build      # production build in dist/
npm run preview    # serve dist/ on http://localhost:3000
```

### Layout

| Path | What it is |
| --- | --- |
| `index.html` | Page markup |
| `src/main.js` | Entry point: fonts, styles, UI setup |
| `src/styles.css` | Page styles and Tailwind layers |
| `src/ui/` | Converter panel, result panel, FAQ, language menu |
| `src/convert/` | One module per format. `index.js` picks the converter and loads it on demand |
| `src/ui/account.js` | Sign-in dialog, account menu, daily limit |
| `server/` | API handlers, auth, database access. `plans.js` holds the limits |
| `api/` | Vercel Function entry points, one per route |
| `tests/` | Vitest tests; `__snapshots__/` holds the expected Markdown for each fixture |
| `scripts/make-fixtures.mjs` | Builds the sample files in `tests/fixtures/` |

### Changing a converter

1. Add a case to `scripts/make-fixtures.mjs` if the change needs one, then run `npm run fixtures`.
2. Run `npm test`. If the output changed on purpose, review the diff in `tests/__snapshots__/` and accept it with `npx vitest run -u`.
3. Check the change against real documents too: `npm run real-docs` downloads public test files into `real-docs/`, and with `npm run dev` running, `npm run real-docs:convert` converts them into `real-docs/out/`.

### OCR

Text recognition uses Tesseract.js with English data. `vite.config.js` copies the worker, the WebAssembly core and `eng.traineddata.gz` from `node_modules` into `tesseract/` at build time, so OCR works without a CDN.

### Accounts and limits

Conversion runs in the browser, so the server only counts finished conversions and the page enforces the limit (see `server/plans.js`). Without the API (a plain static host), the page hides sign-in and converts without limits.

| Route | What it does |
| --- | --- |
| `POST /api/signup`, `POST /api/signin` | Email and password. Passwords are hashed with scrypt; sessions are an HttpOnly cookie |
| `POST /api/signout` | Ends the session |
| `GET /api/me` | Who is signed in, and today's usage |
| `POST /api/usage` | Counts one conversion |

Locally the API uses PGlite, an embedded Postgres stored in `.data/`. Delete that folder to start over.

### Deploy (Vercel + Neon)

1. Create a Neon database and run `DATABASE_URL=... npm run db:migrate` once.
2. Import the repo in Vercel. It detects Vite and turns `api/` into functions.
3. Set `DATABASE_URL` and `SESSION_SECRET` (any long random string) in the project's environment variables.
