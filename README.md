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

## Running it locally

md-display can also run from your own machine, serving files by path: no
picking or permission prompts, live updates in every browser, and links that
open any doc under the folder. It needs Node 22 or later, and nothing else:

```bash
npx -y https://github.com/railsagainstignorance/md-display/releases/latest/download/md-display.tgz ~/notes
```

That fetches the latest release (about 1.6 MB, no dependencies) and serves
`~/notes`: give it a folder, a `.md` file, several, or nothing for the current
folder. To make it a command, add an alias to your shell's startup file:

```bash
alias md-display='npx -y https://github.com/railsagainstignorance/md-display/releases/latest/download/md-display.tgz'
md-display ~/notes
```

npx keeps the first copy it fetches from a URL and runs that from then on,
even once there's a newer release. To update, clear npx's cache and run it
again:

```bash
rm -rf "$(npm config get cache)/_npx"
```

To pin a version instead, use its own URL, such as
`https://github.com/railsagainstignorance/md-display/releases/download/v0.1.0/md-display.tgz`.

It opens `http://127.0.0.1:8765/` in your browser and serves until Ctrl+C.

| Option | Effect |
|---|---|
| `--port 8765` | Port to serve on (the default is 8765). |
| `--next` | If the port is taken, use the next free one nearby. This is the default. |
| `--replace` | If another md-display has the port, stop it and take over. Anything else on the port is left alone. |
| `--wipe` | Stop every running md-display, then start. |
| `--host 0.0.0.0` | Let other machines connect. There's no login, so it prints a warning. |
| `--no-demo` | Leave the demo docs out of the doc list. |
| `--no-browser` | Don't open a browser tab on start. |

Only files under the folder served can be read, never hidden ones (such as
`.env`), and only by pages from this machine. Running servers are noted in
`~/.md-display/servers/` so `--wipe` can find them; each is asked to confirm
it's md-display before it's stopped.

## Development

Needs Node 22.18 or later.

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm test             # Vitest unit tests
npx playwright install chromium
npm run test:e2e     # Playwright, against a production build
npm run build        # the page into dist/, the server into dist-server/
npm run serve -- ~/notes   # the local server, on a built dist/
npm link             # or put the md-display command on your PATH
```

Pushes to `main` are tested and deployed to GitHub Pages by
`.github/workflows/deploy.yml`. The build uses relative paths, so `dist/`
works from any URL prefix.

To release, bump `version` in `package.json`, commit, then tag and push the
tag (`git tag v0.2.0 && git push origin v0.2.0`).
`.github/workflows/release.yml` tests and builds it, packs `dist/` and
`dist-server/` (no runtime dependencies: the page's libraries are bundled into
`dist/`), and attaches `md-display.tgz` to a GitHub release. It fails if the
tag doesn't match the version. Nothing is published to npm.

The code is in three parts: pure renderers (text to HTML) in `src/render/`,
file access behind one interface in `src/source/`, and the page in `src/ui/`. The local
server is in `server/`: plain Node, run as TypeScript in development and
compiled to JS for the release package, since Node won't strip types under
`node_modules`, where npx installs it. The service
worker that makes it work offline is generated at build time by
`build/offline.ts`.

## Licence

MIT. See `LICENSE`.
