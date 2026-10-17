# md-display

View Markdown files and Marp slide decks in your browser, with live updates as
you edit. Nothing to install and nothing uploaded: the page reads your files
on your own computer.

## What it does

- **Documents** render as GitLab renders them (CommonMark and GFM): a nav of
  headings that follows your reading, tables with row headings, front matter,
  raw HTML and Mermaid diagrams.
- **Marp decks** (`marp: true` in the front matter) render as slides, with
  directives, speaker notes, backgrounds, sized images, columns and palette
  classes. Present full screen with thumbnails, a notes overlay, a timer and a
  contents column. Slides with too much content are flagged.
- **Live updates** in Chrome, Edge and other Chromium browsers: save the file
  and the page updates within a second, keeping your place, even mid-talk.
  Firefox and Safari get a Reload button instead.
- **Exports**: print or save as PDF (one slide per page for a deck, or with
  notes on A4), copy as Slack mrkdwn, download the raw Markdown.
- **Offline and installable**: after the first visit it works offline. In
  Chrome or Edge, install it and open `.md` files with it from your file
  manager.

The page opens on a demo of every feature: `demo/md-display-demo.md` and its
slide version, `demo/md-display-demo-slides.md`.

## Using it

Open the page, then **Open file…**, **Open folder…**, or drop files or a
folder on it. Open the folder (not just the file) when a document has images
or links to other documents: the browser only lets the page read what you
picked.

Shortcuts: <kbd>r</kbd> raw Markdown, <kbd>s</kbd> slides or document,
<kbd>n</kbd> speaker notes, <kbd>f</kbd> present (then <kbd>t</kbd>
thumbnails, <kbd>n</kbd> notes, <kbd>c</kbd> timer, <kbd>i</kbd> contents,
<kbd>Esc</kbd> to stop), <kbd>l</kbd> reload (Firefox and Safari).

## Development

Needs Node 22.

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm test             # Vitest unit tests
npx playwright install chromium
npm run test:e2e     # Playwright, against a production build
npm run build        # into dist/
```

Pushes to `main` are tested and deployed to GitHub Pages by
`.github/workflows/deploy.yml`. The build uses relative paths, so `dist/`
works from any URL prefix.

The code is in three parts: pure renderers (text to HTML) in `src/render/`,
file access behind one interface in `src/source/`, and the page in `src/ui/`. The service
worker that makes it work offline is generated at build time by
`build/offline.ts`.

## Licence

MIT. See `LICENSE`.
