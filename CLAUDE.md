# CLAUDE.md

Notes for whoever — human or model — picks this up next.

`README.md` explains the app to a user and describes most of its behaviour in
detail. `PLAN.md` holds the original decisions and is historical. `docs/decisions.md`
holds the why behind each module. **This file is only what you need before
touching anything**; it is kept short on purpose, because it is read in full
every session.

## What this is

A front-end-only SvelteKit app that turns spreadsheet rows into print-ready
cards. Paste or import a table, bind columns to boxes on a WYSIWYG page, print
one card per row. No backend, no accounts, no uploads; `adapter-static` output
that any static host will serve.

## Shape of the code

Sizes are marked where a file is big enough that opening it is a decision.

```
src/lib/
  types.ts        template + runtime types; every coordinate is mm, font sizes are pt
  color.ts       the only place a color string is allowed to become CSS
  css.ts          scopes the template's own CSS to the card; strips @import and remote url()
  parse.ts        CSV / TSV parsing (quoted fields, embedded newlines, delimiter sniffing)
  markdown.ts     hand-written Markdown subset -> HTML, escaping at the leaves
  layout.ts       mm geometry, anchor resolution, grid and sibling-edge snapping
  boxops.ts       box and selection transforms: duplicate, delete, group, lock, nudge
  keys.ts         keyboard chords -> intents, so the page only has to dispatch them
  icons.ts        IBM Carbon icon paths (Apache-2.0), inlined rather than depended on
  png.ts          card -> PNG via SVG foreignObject; inlines stylesheets and stored fonts
  qr.ts           QR encoding (byte mode, versions 1-10) -> SVG
  table.ts        column reorder, row sorting
  imposition.ts   grid math for tiling several cards onto one physical sheet
  download.ts     hand the browser a file; the one copy both exports use
  template.ts     defaults, validation, migration, import/export
  fonts.ts        Google families + local files via FontFace/IndexedDB
  assets.ts       background images: bytes in IndexedDB, object-URL lifetime, url() safety
  history.ts      undo/redo snapshots
  storage.ts      localStorage + IndexedDB, plus the legacy-key migration
  onboarding.ts   the starter template and sample rows a first run lands on
  sw-policy.ts    what the service worker does with a request, kept testable
  pwa.ts          worker registration, the update handshake, the install offer
  version.ts      VERSION, and the bumping rule
  components/
    Card.svelte         the card itself: boxes, handles, drag, snap        (~28k)
    PagePreview.svelte  the stage: zoom, wheel gestures, the pager         (~23k)
    DataTable.svelte    the spreadsheet tray                               (~22k)
    OptionsBar.svelte   shell; picks one of the two bars below
    PageOptions.svelte  page settings bar
    BoxOptions.svelte   box settings bar                                   (~19k)
    options-bar.css     the styles both bars share
    PrintSettingsPanel.svelte  Per Sheet, orientation, sheet background — shared with the print screen
    PrintSheet.svelte  one physical sheet — used off-screen by PrintRoot and, scaled down, as PrintPreview's sheet thumbnails
    SheetLightbox.svelte  one sheet full screen; Lightbox's opposite number, on a different ground
    PrintPreview, PrintRoot, Lightbox, BoxMenu, SelectionTools, Icon
src/service-worker.ts     the offline cache, thin over sw-policy
src/routes/+page.svelte   app state and wiring                             (~40k)
src/routes/app.css        the :root tokens and app-wide rules
static/sample-cards.csv   sample data, bundled with ?raw and also served as a file
```

## Before you change anything

- **Millimetres everywhere.** Coordinates are measured from the trim edge, so
  changing page size or enabling bleed moves nothing. Bleed is an outset on the
  page, never an offset on content. The one exception is a rotation pivot, in
  percent.
- **One layout engine.** The editor and the printed page render through the same
  DOM and the same CSS; never add a second layout path for print.
- **No runtime dependencies.** The Markdown renderer, the CSV parser and the QR
  encoder are hand-written, so the app works offline and nothing can rot
  underneath it. `jsqr` is a dev dependency only — the tests decode generated
  codes with an independent decoder, because a QR that does not scan looks
  exactly like one that does.
- **The app fetches nothing.** The single deliberate exception is `png.ts`,
  which inlines a web font for export. A template is a file someone can hand
  you, and it must not be able to change that.
- **Escaping, color parsing and CSS scoping are chokepoints.** Cell content is
  untrusted: every leaf text node is HTML-escaped in `markdown.ts`; every color
  goes through `color.ts` before it can reach a `style` attribute, and one it
  does not recognise is dropped rather than guessed at; a template's custom CSS
  goes through `css.ts`, which scopes every selector to the card and strips
  `@import` and any non-`data:` `url()`. Tests assert that each renderer *routes*
  through these, not just that the guards work — keep it that way.
- **Undo is snapshots, not a command log.** One entry is the whole editable state
  (template + data + mapping), recorded on a debounce. An inverse operation
  cannot drift out of step with the operation it undoes.
- **Clearing a field means removing it.** "Inherit the page default", "no fill",
  "no border" are all an absent key, so `updateBox` strips undefined values:
  structured clone, unlike JSON, keeps an undefined-valued key.
- **Big things are referenced, never embedded.** A template names a font family
  and a background image; the bytes live in IndexedDB under that name. That is
  what keeps a template small enough to paste into a message.
- **`css.ts` also builds the `<style>` tag.** A literal `<style>…</style>` pair
  written in a `.svelte` file gets picked up by the Svelte toolchain as that
  component's own stylesheet.

Everything else — why anchors resolve after measurement, why stacking is array
order, why the worker never skips waiting, and so on — is in `docs/decisions.md`,
filed under the module it concerns. Read the section for the file you are about
to change.

## Versioning

`src/lib/version.ts` is the source of truth; keep `package.json` in step. Patch
for a fix, minor for a feature, and **the leading zero never moves** — README
has the table.

**Bump once per session, not once per change.** A session is one release however
many commits it takes: set the number when the work starts landing and leave it
alone, so the follow-ups and corrections that always follow do not each claim a
version of their own. Size the single bump by the largest change in the session
— one feature among five fixes still makes it a minor. Bump again within a
session only when asked to.

## How we work

- **Build the risky thing first.** Rendering and printing were proven on day one,
  before any editor UI existed.
- **Verify in a real browser, not just in tests.** Every feature here has been
  driven in headless Chromium — geometry read back in mm, PDFs counted page by
  page, dialogs opened and dismissed. Say what was actually checked, and say it
  plainly; if something was not checked, say that too.
- **Tests cover the pure logic**; components are verified by driving them.
- **Small commits with real messages.** What changed, why that shape, and what
  was verified. No model names in anything that lands in the repo.
- **Comments explain the why.** Not what the line does — why it is that way, and
  what breaks otherwise. Delete a comment that only restates the code.
- **British spelling in prose and in identifiers** (`normalise`, `centre`,
  `recognise`) — with one standing exception: **colour is spelled `color`**,
  everywhere, from the CSS property to the module name to the label in the bar.
  The web platform spells it that way, `Box.color` and `TextStyle.color` are the
  format's own field names, and a codebase that said `parseColour` on one line
  and `color:` on the next was carrying the seam around for no benefit.
- **Say the trade-off out loud.** If a choice is arguable, note it in the commit
  or in a comment rather than leaving the next reader to rediscover it.
- **Never ship anything traceable to reference material.** Sample data and
  template names are invented; contact addresses use reserved `.example` domains.

```bash
npm run dev      # http://localhost:5173
npm test         # vitest, pure-logic units
npm run check    # svelte-check; keep it at zero errors and zero warnings
npm run build    # static output in ./build
```

## Credits

[Dialectic Acheiropoieton](https://heracl.es/libelli) of Heracles Papatheodorou
and&nbsp;Claude
