# libelli

Turn spreadsheet rows into print-ready cards, entirely in the browser.

- **Project page** — https://heracl.es/libelli
- **Live instance** — https://libelli.vercel.app
- **Source** — https://github.com/Arty2/libelli

*Libelli* is the plural of *libellus*, a little book — about the size of the
thing coming out of your printer.

## What it does

You paste a table in, bind its columns to boxes on a page, and print one card
per row. The page is the only thing in the interface with any visual weight: a
white A5 sheet on a grey ground, boxes outlined in dashes while you work,
nothing printed that you did not put there. Any page size works — A5 is just the
default.

It takes what a spreadsheet actually gives you: tab-separated cells copied
straight out of Excel, Coda or Sheets, or a CSV file, quoted fields and
multi-line Markdown cells included. Long bodies flow, empty columns collapse
rather than leaving holes, and cell content is treated as text — a cell
containing `<b>x</b> & "y"` prints exactly that.

For anyone who has a list and needs it on paper: instruction cards, recipe
cards, exhibit labels, revision cards, table talkers.

## How it works

SvelteKit with `adapter-static`, prerendered to files, no backend and no
serverless functions anywhere.

Data comes in through the [table](#the-data-table) as rows of strings, and a
mapping binds each template *slot* to a column. A [card](#cards-and-boxes) is
absolutely-positioned divs inside a page-sized div, with every coordinate in
millimetres measured from the trim edge; [Markdown](#markdown-and-colour) bodies
are rendered to HTML by a small hand-written renderer. The browser does the line
breaking, the wrapping and the [fonts](#fonts), then anchored boxes are placed
against the heights it produced. [Printing](#printing) re-renders the same card
component once per row, so the editor and the paper share one layout engine and
cannot drift apart.

Nothing leaves the browser, because there is nowhere for it to go. Small
settings — the column mapping, keyed by template name, and UI state — live in
`localStorage`; the dataset, the template and any uploaded font bytes live in
IndexedDB, which is where base64 fonts have to go once they blow past
localStorage's ~5MB. [Undo](#undo-and-redo) keeps its snapshots in memory.

## Cards and boxes

A template is a list of boxes on a page. Select one on the page and the options
bar above it becomes that box's inspector; click the background and it becomes
the page's. Drag and resize boxes directly, or type exact millimetres.

- **Millimetres, from the trim edge** — changing the page size or switching bleed
  on moves nothing, because no coordinate was ever expressed in pixels.
- **Slots** — a box renders the column its slot is bound to. The mapping lives
  outside the template, so the same template works against another spreadsheet.
- **`grow` / `clip`** — a grow box keeps its top edge and lengthens downward; a
  clip box keeps its height and hard-cuts what does not fit.
- **Anchors** — a box can take its top edge from the *rendered* bottom of another
  box, plus a gap. Drag an anchored box vertically and the gap changes rather
  than the link breaking.
- **Hide when empty** — a box whose column is blank collapses to nothing *and*
  drops out of the anchor chain, so a card with no subtitle has no dead band
  where the subtitle would have been. A box with no anchor stays pinned to its
  own Y however long the body above it runs.
- **Bleed** — an outset on the page, never an offset on content: turning it on
  changes the sheet size, optionally with crop marks, and every box stays
  visually where it was.

## The data table

The right-hand panel is the dataset: one row per card, one column per field.
Clicking a row previews it.

- **Paste from Excel** — a modal that takes whatever the clipboard holds. Tabs,
  commas and semicolons are told apart by sniffing, quoted fields and embedded
  newlines survive, and rows can replace or append.
- **Import CSV** — the same parser against a file.
- **Rename in place** — type in a column header; the cells and any slot bound to
  that column follow the rename.
- **Reorder** — ‹ › in a header move a column left or right. Row objects are
  keyed by name, so this changes the view and nothing else.
- **Sort** — the arrow in a header sorts the rows by that column; click again to
  reverse it. Numbers sort by value rather than by digit, case is ignored, and
  blanks stay at the bottom either way. This reorders the data, not just the
  view, because row order *is* print order — and it is undoable.
- **Add** — *+ Row* and *+ Column*, or the `+` at the end of the header row.
- **Delete** — asks first, naming what goes: the number of filled cells for a
  column, the opening text for a row. Undoable either way.

## Markdown and colour

Body boxes render a deliberately small Markdown subset, written by hand so the
app carries no runtime dependencies and works offline. Everything outside the
subset renders as literal text, and every leaf text node is escaped.

Supported: `#`/`##`/`###` headings, `-` and `*` bullets with one level of
nesting, `1.` ordered lists, `**bold**`, `*italic*`, `` `code` ``,
`[text](url)`, blank-line paragraphs, and `---`.

- **Ordered lists renumber** — from the source order, so a list that restarts
  part-way through still prints as one sequence.
- **Links are filtered** — `http`, `https`, `mailto`, `tel` and relative URLs
  only; a bare address becomes a `mailto:`. Anything else stays as text.
- **Per-word colour** — `[a few words]{red}` or `[…]{#b42318}` colours just that
  run.
- **Three levels of colour** — a default text colour for the card, a colour for
  any single box, and the inline form above. A box's colour beats the default;
  the inline form beats both.
- **Paper colour** — set on the page. It prints only with the browser's
  background graphics switched on, which the app says out loud next to Print.

Colours from a template file, a settings field or a spreadsheet cell all go
through one parser that accepts hex and a named set and refuses everything else,
so nothing can ride into a style attribute behind a colour.

## Images and QR codes

Two box modes carry something other than text. Both are framed by the box's
declared height, and both take a **Fit**: *fit* puts the whole thing inside the
box, *cover* fills the box and crops the overflow, *stretch* distorts it to the
box exactly.

- **Image** — a data URL, an external URL, or inline SVG held in the template.
  A bound column can supply the URL per row.
- **QR code** — the bound cell is encoded as a QR and drawn as SVG, so it stays
  sharp at any print size; a raster QR at print resolution is the classic way to
  end up with a code no phone will read. Byte mode, versions 1–10, which holds
  213 characters at correction level M — enough for any URL worth putting on a
  card. **Correction** trades capacity for damage tolerance (L 7% to H 30%), and
  **Quiet zone** sets the blank border scanners need; two modules is the
  practical minimum. Text the encoder cannot hold renders as nothing rather than
  as a square that will not scan.

The encoder is written here rather than pulled in, like the Markdown renderer
and the CSV parser. Its tests decode what it produces with an independent
decoder, since a QR that does not scan looks exactly like one that does.

## Fonts

Pick a curated Google family, type any other family name, or upload a file.

- **Google families** — injected as a stylesheet link. Bold and italic cuts are
  requested first; single-weight families reject that request, so the app
  retries plain and lets the browser synthesise.
- **Local files** — `.woff2`, `.woff`, `.otf`, `.ttf`, registered with
  `FontFace` and kept in IndexedDB, so they are still there next visit.
- **Never substituted** — open a template that names a font this browser has
  never seen and it asks you for the file rather than quietly picking another.

## Printing

Print renders every row into a dedicated container and hands it to the browser:
`@page { size: <w>mm <h>mm; margin: 0 }`, one page per row, no trailing blank.

The app keeps a short panel of dialog settings next to the button, because two
of them catch everyone out: set **Margins** to *None*, uncheck **Headers and
footers**, and switch on **Background graphics** — Chrome drops background
colours by default, paper colour included.

## Contact sheet

Every row rendered as a small page in a grid, for checking a whole set at once.
Click a thumbnail to open it full screen, <kbd>←</kbd> / <kbd>→</kbd> to move
between cards, <kbd>Esc</kbd> to come back out.

## Undo and redo

One undo entry is a snapshot of the whole editable state — template, data and
mapping — recorded on a short debounce, so a drag or a burst of typing is a
single step rather than forty. Snapshots rather than a command log: an inverse
operation cannot drift out of step with the operation it undoes, and this state
is small enough that the cost does not matter. The last 60 steps are kept.

Reset is covered by it too: deleting everything returns you to the starter card
and sample data, with your work one undo away. Uploaded fonts are the exception
— those are gone from the browser, and the dialog says so before you confirm.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>z</kbd> | Undo |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>z</kbd> | Redo |
| <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> | Nudge the selected box by 1mm |
| <kbd>⇧</kbd> + arrows | Nudge by 5mm |
| <kbd>Alt</kbd> + arrows | Nudge by 0.25mm |
| <kbd>Delete</kbd> | Remove the selected box |
| <kbd>Esc</kbd> | Deselect, or close what is open |
| <kbd>←</kbd> <kbd>→</kbd> | Previous / next card, in the contact sheet |

While a text field has focus, undo is left to the browser's own text history and
<kbd>Delete</kbd> deletes characters — the app keeps its hands off both. Nudging
needs the page area focused, which clicking a box does. Dragging snaps to 0.5mm;
hold <kbd>Alt</kbd> for 0.01mm.

## Settings

- **Page** — template name, width, height, default font, default text colour,
  paper colour, default size, bleed on/off, bleed amount, crop marks
- **Box** — slot, bound column, font, size, weight, leading, alignment, colour,
  mode (plain / markdown / image / QR), fit (image and QR), QR correction and
  quiet zone, overflow (grow / clip), X, Y, W, H, anchor, anchor gap, hide when
  empty
- **View** — in the bottom corners of the page itself, not the toolbar: box
  outlines on/off (screen only, never printed) at the left, zoom (fit, or 50% to
  200%) at the right

## Import and export

A template travels as JSON and carries no data with it — that is the point of
keeping the column mapping outside it.

- **Export template** — fonts referenced by family name. Small, diffable,
  git-friendly. The default.
- **Export bundle** — the same file with font bytes embedded as base64.
  Self-contained, larger, for handing to someone who does not have the fonts.
- **Import** — one button takes either. A bundle is recognised by the font bytes
  it carries, and those are installed into this browser before the template
  renders.

Whichever arrives, the column mapping is put to you for confirmation rather than
assumed, since the template may have been built against a different spreadsheet.
A template claiming a schema newer than the app understands is refused outright
rather than half-read.

Data comes in as CSV or pasted TSV and goes out as printed pages; the dataset
itself stays in the browser.

## Developer and testing

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest — parse, markdown, layout, template, history, colour
npm run check    # svelte-check; kept at zero errors and zero warnings
npm run build    # static output in ./build, deployable anywhere
```

- **Sample data is bundled, not fetched** — `static/sample-cards.csv` is imported
  with `?raw`, so a first run works offline and cannot land on an empty table
  because a request failed. *Load sample* in the table footer brings it back at
  any time.
- **Reset** — clears the template, data, mapping and fonts from this browser and
  returns to that first-run state, after asking twice.
- **Components are verified by driving them** — the pure logic has unit tests;
  layout, printing and the dialogs are checked in a real browser, where the
  geometry can be read back in millimetres and the PDF counted page by page.
- **Version** — `src/lib/version.ts` is the source of truth, kept in step with
  `package.json`. A fix is a patch (0.1.0 → 0.1.1), a feature is a minor
  (0.1.1 → 0.2.0), and the leading zero never moves.

`CLAUDE.md` covers the load-bearing decisions and how the code is meant to be
worked on; `PLAN.md` is the plan it was built from.

## Credit

[Dialectic Acheiropoieton](https://heracl.es/libelli) of Heracles Papatheodorou
and&nbsp;Claude

MIT License.
