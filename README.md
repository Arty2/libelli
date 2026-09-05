# libelli

Turn a spreadsheet into print-ready cards. Paste rows out of Excel, Coda or
Sheets, bind columns to boxes on a WYSIWYG page, and print one card per row.
A5 out of the box, any page size you like.

Front-end only: SvelteKit with `adapter-static`, no backend, no serverless
functions, no uploads. Everything — data, templates, fonts — stays in the
browser.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in ./build
npm test         # unit tests
npm run check    # svelte-check
```

## How it works

**Millimetres everywhere.** Every coordinate in a template is in mm measured
from the trim edge, so changing the page size or switching bleed on moves
nothing. Font sizes are in points, the unit a designer types.

**DOM rendering, browser printing.** Cards are absolutely-positioned divs inside
a page-sized div; printing uses `@page { size: <w>mm <h>mm; margin: 0 }`. Editor
and print output share one layout engine, so they cannot drift.

**Anchors.** A box can take its top edge from the *rendered* bottom of another
box (`anchor: { to, gap }`). A box with `hideWhenEmpty` collapses when its column
is blank *and* disappears from the anchor chain, so a card without a subtitle has
no dead band where the subtitle would have been. A box with `anchor: null` is
pinned to its own `y` — that is how the category footer stays at 199mm however
long the body runs.

**Markdown subset.** `src/lib/markdown.ts` is hand-written, so the app stays
dependency-free and works offline. It supports `#`/`##`/`###`, `-`/`*` bullets
(one nesting level), `1.` ordered lists (renumbered from source order),
`**bold**`, `*italic*`, `` `code` ``, `[text](url)`, blank-line paragraphs and
`---`. Everything else is literal text, and every leaf node is HTML-escaped —
a cell containing `<b>x</b> & "y"` prints exactly that.

**Storage.** localStorage holds the column mapping (keyed by template name) and
UI state. IndexedDB holds the dataset, the template and uploaded font bytes,
because base64 fonts blow through localStorage's ~5MB and its synchronous API
blocks the main thread. *Reset* in the toolbar wipes both.

**Undo/redo.** One entry is a snapshot of the whole editable state — template,
data and mapping — recorded on a debounce, so a drag or a burst of typing is one
step. Snapshots cannot drift out of step with the actions they reverse the way a
command log can, and the state is small enough that the cost does not matter.
Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, or the arrows in the toolbar; while a text field
has focus the browser's own text undo is left alone.

## Using it

1. **Data in.** *Paste from Excel* (tabs, commas, quoted multi-line cells all
   parse), *Import CSV*, or *Load sample* for the four mock cards in
   `static/sample-cards.csv`. Clicking a row previews it.
2. **Edit the table.** Rename a column by typing in its header, add one with
   *+ Column*, add rows with *+ Row*. Deleting a row or a column asks first,
   naming what goes with it — and is undoable either way.
3. **Map columns.** Select a box; the options bar binds its slot to a column.
   The mapping lives outside the template, so a template can be shared between
   spreadsheets — on import you are asked to confirm it rather than it being
   assumed.
4. **Edit boxes.** Drag and resize on the page, or type exact mm values. Arrow
   keys nudge (Shift = 5mm, Alt = 0.25mm). Dragging an anchored box vertically
   adjusts its gap, not its `y`, so the relationship survives.
5. **Fonts.** Pick a Google family, type any other family name, or upload a
   `.woff2`/`.woff`/`.otf`/`.ttf`. If an imported template references a local
   font this browser has never seen, you are prompted for the file — nothing is
   silently substituted.
6. **Print.** In the print dialog set **Margins** to *None*, uncheck **Headers
   and footers**, and switch on **Background graphics** (Chrome drops background
   colours by default).

## Template format

`src/lib/templates/default-card.json` is the built-in template and the worked
example of the format. `schema` is mandatory: a file claiming a newer schema is
refused rather than half-read.

- `mode`: `plain` | `markdown` | `image`
- `overflow`: `clip` (fixed height, hidden) | `grow` (fixed top, height auto,
  `min-height: h`)
- `slot`: the name a column binds to; `null` means static content from `static`
- `bleed`: `{ enabled, amount, cropMarks }` — implemented as an outset on the
  page, never an offset on content

Two export flavours: **Export template** references fonts by family name (small,
diffable, git-friendly), **Export bundle** embeds font bytes as base64
(self-contained, larger).

## Layout

```
src/lib/
  types.ts        template + runtime types
  parse.ts        CSV / TSV parsing
  markdown.ts     markdown subset renderer
  layout.ts       mm geometry + anchor resolution
  template.ts     defaults, validation, migration, import/export
  fonts.ts        Google + local font loading
  history.ts      undo/redo snapshots
  storage.ts      localStorage + IndexedDB
  components/     Card, PagePreview, DataTable, OptionsBar, ContactSheet, PrintRoot
src/routes/+page.svelte
static/sample-cards.csv
```

`PLAN.md` records the decisions behind all of the above.

## Deploying

`npm run build` writes a static site to `build/`. Any static host works; on
Vercel the SvelteKit preset picks it up with no configuration and no functions.

## Credits

Dialectic Acheiropoieton of Heracles Papatheodorou and&nbsp;Claude
