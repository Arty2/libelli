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

A template is a list of boxes on a page. Page setup and box settings are two
separate bars: **Page Setup** in the toolbar shows or hides the template's own
settings, and a box's bar appears under it whenever a box is selected. Drag and
resize boxes directly, or type exact millimetres.

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
- **Alignment** — horizontal (left, centre, right, justified — justified text
  hyphenates) and vertical (top, middle, bottom) within the box's own frame.
- **Stacking** — areas paint in the order they are listed, so *Bring to Front*
  is a move to the end of that list rather than a z-index to keep in step.
  Several move as a block, keeping their order relative to each other. In the
  bar, in the rail and on right-click.
- **Several at once** — shift-click (or Ctrl/Cmd-click) to build a selection,
  Ctrl/Cmd+A for all of them. Dragging any one moves the set; a column of icons
  appears beside the page, under undo and redo, to line them up against the box
  that encloses them all — left, centre, right, top, middle, bottom — and to
  lock, duplicate or delete the lot. **Group** makes
  a selection stick, so clicking any member picks up all of them; it is a shared
  name on each box rather than a container, which keeps the box list flat and
  leaves anchoring and stacking alone. Right-clicking inside a selection offers
  the same things the bar does — the six alignments as one icon row, then group,
  lock, duplicate and delete — and keeps the selection rather than collapsing it.

  One consequence worth stating: an anchored area takes its top from another,
  so lining it up vertically would be undone on the next render. Those areas sit
  the vertical alignments out and keep their anchor — the anchor badge at the
  corner says why, and the status line says how many stayed put. Horizontal
  alignment cannot fight an anchor, so they take part in that as usual.
- **Where a box gets its content** — one choice with two answers. A **Data
  Field** binds it to a spreadsheet column, so it changes card to card. **Static
  Text** is typed into the box and saved in the template, so it says the same on
  every card and travels with the design rather than with the data. An area with
  nothing typed into it is still an area — it keeps its fill, its border and its
  size, and **Hide When Empty** is what takes it away again. *+ Area* beside the
  page adds one, starting as static text.
- **Rotation** — degrees clockwise, turning about a pivot you can drag on the
  area itself or type as a percentage of its width and height. The pivot only
  appears once there is a rotation to see it against. A turned area still
  occupies the space it would have upright, so anchored areas below it do not
  move — turning one thing never shuffles the card.
- **Overflow** — a red corner appears on a box whose content is taller than the
  box will let it be, because a clipped card looks fine on screen right up until
  it is printed.
- **Past the edge** — the editor does not cut anything off at the card's edge:
  drag an area half off the page and it stays visible, with its handles where
  you can still reach them. What prints is another matter — the paper stops
  where the card does, and the print, the PNG and the contact sheet all clip
  there.
- **Surface** — a fill colour, padding, a border and a corner radius, all in
  millimetres. A padding and a border each take one measurement all round, or
  one per edge behind the expander next to it; a border's style and the corner
  radius are always for the whole box. Four equal edges collapse back to a
  single number, so a template never grows structure it did not ask for. The border sits *inside* the box's
  millimetres rather than outside them, so framing a box does not move it or
  anything anchored below it — though padding and a border do make the box
  taller, which an anchored box below will follow, as it should.
- **Type without the bar** — <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> and the
  scroll wheel sizes whatever the pointer is over, in points, and the same
  modifiers with the arrows step the alignment of the selection in the direction
  pressed. Both give an area a value of its own on the first go, so an area that
  was inheriting stops.
- **Type defaults** — page setup holds the family, size, leading, spacing and
  colour. A box that leaves those fields blank inherits them, so changing the
  page moves every box that never overrode it; a new box starts out inheriting
  everything.
- **Bleed** — an outset on the page, never an offset on content: turning it on
  changes the sheet size, optionally with crop marks, and every box stays
  visually where it was. On screen the trim edge is marked in purple, on the
  same toggle as the area bounds. The grid keeps its corner at the trim, not at
  the sheet, so turning bleed on does not slide the gridlines under the boxes
  they are there to measure.
- **Background image** — *Upload…* takes a file from this machine, *Link…* takes
  an http(s) address, and either can **cover**, be **contained**, or **tile**.
  The image reaches the cut edge, bleed included, and sits on top of the paper
  colour — so like the paper colour, it prints only with background graphics on.
  **The picture is never part of the template.** An uploaded file's bytes stay in
  this browser and the template carries only its name; a linked one carries the
  address. Open a template on another machine and it asks for the file by name
  rather than rendering a blank page — the same bargain as an uploaded font.
- **Page numbers** — off by default; six corners to choose from, an adjustable
  margin, and the template's default type. The number is the row's position, so
  the editor, the print preview and the print all agree.
- **Lock** — **Lock** in either bar freezes what you have: no dragging, no
  resizing, no option changes. A locked area can still be *selected*, or the
  button that unlocks it could never be reached. A page lock covers every box and the page settings
  as well. A padlock appears on the locked box, or at the corner of a locked
  page, as an indicator — the button that sets it is in the bar, with the rest of
  that subject's settings. Turning bounds off takes the padlocks with it.
- **Custom CSS** — page setup has a CSS button; what you write there is saved
  inside the template and travels with it. Selectors are scoped to the card, so
  nothing in a template can restyle the editor around it, and `@import` and any
  `url()` pointing off this machine are stripped — the app fetches nothing.

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
- **Add** — the pale row and column at the end of the table are placeholders:
  type into one and it becomes real. There is no separate button, because the
  place you would click is the place you were already typing.
- **Delete** — immediate, with a line saying what went. Undo covers it; a
  confirmation you dismiss without reading protects nobody. The red bin at the
  end of the toolbar is the exception: it empties the whole dataset and asks
  twice, because that is not one row you can retype.

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

## Print preview

One screen holds both halves of getting a print right: every row rendered as a
small page, and the four dialog settings the browser gets wrong by default —
pick the **paper size** matching the card's millimetres, set **Margins** to
*None*, uncheck **Headers and footers**, and switch on **Background graphics**,
which Chrome drops along with the paper colour. Checking the cards and reading
the checklist are the same act, so they are the same screen.

**Export…** is the only way in, so there is no route to the printer that skips
the look at what you are about to spend paper on. From it: **Print**, or
**PNG** for one 300 dpi file per selected page — rendered here, with no
library, by carrying the card into an SVG `foreignObject` and drawing that to a
canvas. Every face is embedded: uploaded ones from this browser, and a Google
family by fetching the stylesheet the page already loaded and the font files it
points at. That fetch is the one exception to *the app fetches nothing*, and it
is confined to the export, because a PNG in the wrong typeface is not the card.
A request that is blocked or offline leaves that family in the fallback stack
and the export says which.

The print checklist sits at the bottom of that screen, under the pages: the
cards are what you came to look at, and the four settings are what to do once
you have.

Every page has a checkbox under it, and only the ticked ones print — untick the
three proofs that came out wrong and reprint just those. **Select All** /
**Select None** does the whole run, and the title says how many pages are going.
A page keeps the number it has in the table however few of
them go, so page 4 prints as page 4 even when it is the only one selected. The
selection is for one print: reopening the preview starts from every page again,
because sorting or deleting a row moves the positions it was pinned to.

Click a thumbnail to open that card full screen, <kbd>←</kbd> / <kbd>→</kbd> to
move between cards, <kbd>Esc</kbd> to come back out.

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
| <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> | Nudge the selection by 1mm |
| <kbd>⇧</kbd> + arrows | Nudge by 5mm |
| <kbd>Alt</kbd> <kbd>⇧</kbd> + arrows | Nudge by 10mm |
| <kbd>Delete</kbd> | Remove the selected areas |
| <kbd>Esc</kbd> | Deselect, or close what is open |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>h</kbd> | Bounds on or off |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>'</kbd> | Grid on or off |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> + arrows | Step the alignment — left, right, top, bottom |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> + scroll | Size the type in the area under the pointer |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>+</kbd> / <kbd>−</kbd> | Zoom the page in or out |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>0</kbd> | Fit the page (<kbd>⇧</kbd> for 100%) |

While a text field has focus, undo is left to the browser's own text history and
<kbd>Delete</kbd> deletes characters — the app keeps its hands off both.
Otherwise the arrow keys move the selected box wherever you are on the page. On
a touch screen the same job is done by the four-way pad that appears beside the
card, with a chip cycling between 1mm, 5mm and 10mm; holding an arrow keeps it
moving. Pinching zooms the page, as do the zoom keys above.

Dragging snaps in this order: switch **Grid** on and everything snaps to the 5mm
subgrid of a 10mm grid; otherwise a box latches onto the edges and centres of
its neighbours as it passes them, and a guide shows what it caught. There is no
key to hold for free movement — switch **Grid** and **Bounds** both off and
nothing latches, because a box should never snap to a guide you cannot see.

## Settings

Both bars run in groups, outward from the thing itself:

- **Page** — name · sheet size, bleed, crop marks · type defaults (font, size,
  leading, spacing, colour) · surface (paper colour, background image and fit) ·
  page number and its margin · then the actions: CSS, import, export, lock, add
  a box
- **Area** — content (field, column or static text, mode, fit, QR settings) ·
  type (font, size, weight, leading, spacing, case, colour) · alignment,
  horizontal and vertical · surface (fill, padding, border width, style and
  colour, radius) · position (x, y, anchor, gap) · size (w, h, overflow, hide
  when empty) · rotation and its pivot · then the actions: duplicate, delete,
  lock
- **Stacking order** — not in the bar: a column beside the page, under undo and
  redo, whenever anything is selected. Bring to front, forward, backward, send
  to back.
- **Selection** — with more than one area chosen, another column appears under
  that one — the six alignments, then group, lock, duplicate, delete. The
  right-click menu carries the same set with its wording.

Undo and redo sit in a column at the page's top-left corner and *+ Area* at its
top-right, rather than in the window's toolbar, next to the thing they act on. The top toolbar holds only what is about
the whole app: Help, Data, Page Setup, Export.
- **View** — in the bottom corners of the page itself, not the toolbar: grid and
  area bounds at the left (screen only, never printed), zoom at the right;
  between them, under the sheet, which card of how many you are looking at

Every number says its unit: mm for geometry, bleed, spacing and gaps, pt for
type size, modules for a QR padding.

## Import and export

A template travels as JSON and carries no data with it — that is the point of
keeping the column mapping outside it.

- **Export** — in page setup: fonts referenced by family name, and a background image
  by file name or address. Small, diffable, git-friendly — no picture and no font
  bytes are ever folded into it. Custom CSS, page numbers and locks travel with
  it.
- **Import** — next to that export, so it cannot be mistaken for *Import CSV*
  under the table. Any font or background image the
  template names but this browser does not have is asked for by name rather than
  substituted. A linked background is only ever an http(s) address; a template
  cannot smuggle one in as `data:` or point the browser at anything else.

The column mapping is put to you for confirmation rather than assumed, since the
template may have been built against a different spreadsheet.
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
- **Deploying** — `npm run build` writes a static site to `build/`; any static
  host serves it. `vercel.json` states the build command and output directory
  outright and turns the framework preset off, because Vercel reads this as a
  plain Vite app and goes looking for `dist/`. Not the SvelteKit preset: that
  expects the Vercel adapter's `.vercel/output`, which would mean serverless
  functions this app has no use for.

`CLAUDE.md` covers the load-bearing decisions and how the code is meant to be
worked on; `PLAN.md` is the plan it was built from.

## Credit

[Dialectic Acheiropoieton](https://heracl.es/libelli) of Heracles Papatheodorou
and&nbsp;Claude

MIT License.
