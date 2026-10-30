# MarkFlow

Converts PDF, Word, PowerPoint, Excel, CSV, HTML, JSON, XML, Jupyter, EPUB, ZIP and image files to Markdown, entirely in the browser. Files are never uploaded: the converters, OCR engine and fonts are all served from the site itself. A small API handles accounts and the daily conversion count; it never sees file contents.

## Develop

Requires Node 20 or later.

```sh
npm install
npm run dev        # http://localhost:3000, with the API on /api
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
| `src/ui/account.js` | Sign-in dialog, account menu, daily limit |
| `server/` | API handlers, auth, database access. `plans.js` holds the limits |
| `api/` | Vercel Function entry points, one per route |
| `tests/` | Vitest tests; `__snapshots__/` holds the expected Markdown for each fixture |
| `scripts/make-fixtures.mjs` | Builds the sample files in `tests/fixtures/` |

## Changing a converter

1. Add a case to `scripts/make-fixtures.mjs` if the change needs one, then run `npm run fixtures`.
2. Run `npm test`. If the output changed on purpose, review the diff in `tests/__snapshots__/` and accept it with `npx vitest run -u`.

## OCR

Text recognition uses Tesseract.js with English data. `vite.config.js` copies the worker, the WebAssembly core and `eng.traineddata.gz` from `node_modules` into `tesseract/` at build time, so OCR works without a CDN.

## Accounts and limits

Without an account you get 3 conversions a day; a free account gets 30 (see `server/plans.js`). Conversion runs in the browser, so the server only counts finished conversions and the page enforces the limit. Without the API (a plain static host), the page hides sign-in and converts without limits.

| Route | What it does |
| --- | --- |
| `POST /api/signup`, `POST /api/signin` | Email and password. Passwords are hashed with scrypt; sessions are an HttpOnly cookie |
| `POST /api/signout` | Ends the session |
| `GET /api/me` | Who is signed in, and today's usage |
| `POST /api/usage` | Counts one conversion |

Locally the API uses PGlite, an embedded Postgres stored in `.data/`. Delete that folder to start over.

## Deploy (Vercel + Neon)

1. Create a Neon database and run `DATABASE_URL=... npm run db:migrate` once.
2. Import the repo in Vercel. It detects Vite and turns `api/` into functions.
3. Set `DATABASE_URL` and `SESSION_SECRET` (any long random string) in the project's environment variables.
