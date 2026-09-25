# AGENTS.md

Notes for whoever — human or agent, Claude or otherwise — picks this up next.
`CLAUDE.md` is a one-line import of this file plus the two Claude Code-specific
notes; edit this file, not that one.

`README.md` explains the app to a user and describes most of its behaviour in
detail. `PLAN.md` holds the original decisions and is historical. `docs/decisions.md`
holds the why behind each module. **This file is only what you need before
touching anything**; it is kept short on purpose, because it is read in full
every session — and because a bloated instructions file trains whoever reads it
to skim, which defeats the point of writing one. Push detail into
`docs/decisions.md` rather than growing this file; `npm run gates` holds it to a
line budget so that stays a number rather than a hope.

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
  layout.ts       mm geometry, anchors, snapping, and the left/right page mirror
  autolayout.ts   reads the columns, writes a first draft of a card
  boxops.ts       box and selection transforms: duplicate, delete, group, lock, nudge
  keys.ts         keyboard chords -> intents, so the page only has to dispatch them
  gestures.ts     swipe and press-and-hold, shared by the components that need them
  complete.ts     the column names `{{` offers, in any field that holds text
  modal.ts        the two-Enter rule every dialog with a default action shares
  icons.ts        IBM Carbon icon paths (Apache-2.0), inlined rather than depended on
  png.ts          card -> PNG via SVG foreignObject; inlines stylesheets and stored fonts
  qr.ts           QR encoding (byte mode, versions 1-10) -> SVG
  hand.ts         a border drawn by hand: seeded wobble -> SVG paths, in mm
  bitmap.ts       the pixel budget a drawn area gets, and pointing at it
  tile.ts         a drawing cropped to its ink, for an area that repeats
  table.ts        column reorder, row sorting
  imposition.ts   tiling cards onto a sheet, in reading order or a zine's fold
  download.ts     hand the browser a file; zip.ts packs several into one
  template.ts     defaults, validation, migration, import/export
  fonts.ts        Google families + local files via FontFace/IndexedDB
  assets.ts       images — page backgrounds and a row's own; bytes in a folder or IndexedDB
  history.ts      undo/redo snapshots
  storage.ts      localStorage + IndexedDB, the template library, the legacy-key migration
  onboarding.ts   the starter template and sample rows a first run lands on
  sample-cards.csv  those rows, as a CSV anyone can open in a spreadsheet
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
    BitmapEditor.svelte  the drawing surface, full screen; writes a base64 PNG into the row
    ImagesPanel.svelte  what is stored, what it weighs, and the folder to keep it in instead
    PrintPreview, PrintRoot, Lightbox, BoxMenu, SelectionTools, MenuSelect, ColorField, Icon
src/service-worker.ts     the offline cache, thin over sw-policy
src/routes/+page.svelte   app state and wiring                             (~40k)
src/routes/app.css        the :root tokens and app-wide rules
```

## Before you change anything

- **Millimetres everywhere.** Coordinates are measured from the trim edge, so
  changing page size or enabling bleed moves nothing. Bleed is an outset on the
  page, never an offset on content. The one exception is a rotation pivot, in
  percent.
- **One layout engine.** The editor and the printed page render through the same
  DOM and the same CSS; never add a second layout path for print.
- **Evergreen browsers, Baseline *Widely* available.** No polyfills, no legacy
  target. A new CSS or JS feature has to be
  [Widely available](https://web.dev/baseline), not merely *Newly* — and weigh
  the failure mode, not just the support table: a feature that degrades costs
  little, one invalid at computed-value time takes the whole declaration with it
  and can leave a page unreadable. One standing exception, taken knowingly:
  `field-sizing: content` in `DataTable.svelte`, which falls back to a fixed
  scrollable field. Anything failing worse than that waits.
- **A template stores the right-hand page.** With facing pages on, a left-hand
  page is `mirrorBox` applied as the card is drawn — never a second set of
  coordinates. Anything that writes geometry back (dragging, nudging, the
  fields in the bar) works in the stored frame, so a mirrored drag is undone
  before it is written, not stored mirrored.
- **No runtime dependencies.** The Markdown renderer, the CSV parser and the QR
  encoder are hand-written, so the app works offline and nothing can rot
  underneath it. `jsqr` is a dev dependency only — the tests decode generated
  codes with an independent decoder, because a QR that does not scan looks
  exactly like one that does.
- **The app makes no request nobody asked for.** Three paths out: `png.ts`
  inlines faces and pictures for export, the worker caches, and `fonts.ts`
  appends a `<link>` for a Google family. A template reaches the last — it names
  fonts and may name an http(s) background — so the guard is on *what* it can
  name, never on whether a request happens (`safeFamily`, `safeImageUrl`). Same
  reason a cell says `local:name`: a bare file name is a relative URL, and a
  relative URL is a request. The gate sees only `fetch`; a `<link>` or an `<img>`
  is one it cannot check for you. README § What leaves this machine is the
  user-facing version.
- **Escaping, color parsing and CSS scoping are chokepoints.** Cell content is
  untrusted: every leaf text node is HTML-escaped in `markdown.ts`; every color
  goes through `color.ts` before it can reach a `style` attribute, and one it
  does not recognise is dropped rather than guessed at; a template's custom CSS
  goes through `css.ts`, which scopes every selector to the card and strips
  `@import` and any non-`data:` `url()`. Tests assert that each renderer *routes*
  through these, not just that the guards work — keep it that way, and see
  **Rules that execute** for the gate that holds the chokepoints to three files.
- **A parser reports; the caller decides.** `parse.ts` says what a file holds,
  including "nothing"; whether nothing is acceptable is a policy, and it belongs
  at the one place the destructive decision is made. Two callers each inventing
  their own emptiness rule is how a paste came to refuse an unreadable file
  while an import of that same file quietly emptied the table.
- **Undo is snapshots, not a command log.** One entry is the whole editable state
  (template + data + mapping), recorded on a debounce. An inverse operation
  cannot drift out of step with the operation it undoes.
- **Clearing a field means removing it.** "Inherit the page default", "no fill",
  "no border" are all an absent key, so `updateBox` strips undefined values:
  structured clone, unlike JSON, keeps an undefined-valued key.
- **Big things are referenced, never embedded.** A template names a font family
  and a background image; the bytes live under that name in the folder the user
  chose, or in IndexedDB where there is none. That is what keeps a template small
  enough to paste into a message. The one exception is a drawing, which is base64
  in the cell on purpose: it has no existence anywhere else, so it travels with
  the table.
- **`css.ts` also builds the `<style>` tag.** A literal `<style>…</style>` pair
  written in a `.svelte` file gets picked up by the Svelte toolchain as that
  component's own stylesheet.

Everything else — why anchors resolve after measurement, why stacking is array
order, why the worker never skips waiting, and so on — is in `docs/decisions.md`,
filed under the module it concerns. Read the section for the file you are about
to change.

## Rules that execute

A rule that only lives in prose gets broken by the first change that does not
re-read it — including by whoever wrote it, who always has a good reason. So
every rule above that *can* be checked is: `npm run gates` runs `scripts/gates.sh`
first in CI and fails the build on injection sinks, `{@html}` outside its three
renderers, a `fetch` outside `png.ts` and the worker, a runtime dependency, a
security header gone missing from `vercel.json`, `colour` spelled as a name, a
`VERSION` out of step with `package.json`, and this file over its line budget.

`npm run lint` is the other half and runs next in CI: ESLint knows what a
linter can know, the gates cover what it cannot. Where a rule is off,
`eslint.config.js` says why beside it — a rule switched off silently is worse
than one never switched on.

Add the next rule there rather than as a paragraph here. Each run also appends
one line to the gitignored `.claude/logs/gates.jsonl`, which is how "this gate
has never once fired" becomes answerable instead of anecdotal.
`docs/decisions.md` § `scripts/gates.sh` has the conventions for writing one and
what the log is for.

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

**Once the session has a pull request open, every further push bumps the
patch.** The one-bump rule holds while the work is still the session's own;
a PR hands it to a reviewer, and from then on each push is something they may
already have read the last version of. So: no bump until the PR exists, then
`0.8.0` → `0.8.1` → `0.8.2`, one per push, whatever the push contains.

## How we work

- **Build the risky thing first.** Rendering and printing were proven on day one,
  before any editor UI existed.
- **Verify in a real browser, not just in tests.** Every feature here has been
  driven in headless Chromium — geometry read back in mm, PDFs counted page by
  page, dialogs opened and dismissed. Say what was actually checked, and say it
  plainly; if something was not checked, say that too.
- **Read what the build emitted, not the config you wrote.** A config option
  that is silently dropped looks exactly like one that works. After a change to
  anything the toolchain rewrites — the service worker's precache list, the
  prerendered HTML, the static output — open the file in `build/` and check the
  change is actually in it.
- **Tests cover the pure logic**; components are verified by driving them.
- **Small commits with real messages.** What changed, why that shape, and what
  was verified. No model names in anything that lands in the repo.
- **Comments explain the why.** Not what the line does — why it is that way, and
  what breaks otherwise. Delete a comment that only restates the code.
- **British spelling in prose and in identifiers** (`normalise`, `centre`,
  `recognise`) — with one standing exception: **colour is spelled `color`**
  wherever it is the name of the thing — the CSS property, the custom property,
  the module, every identifier, and the label on the control in the bar. The web
  platform spells it that way, `Box.color` and `TextStyle.color` are the format's
  own field names, and a codebase that said `parseColour` on one line and
  `color:` on the next was carrying the seam around for no benefit. Ordinary
  prose keeps its `u` — a tooltip reading "the paper colour" is a sentence, not
  a name — and that is where the gate draws the line.
- **Say the trade-off out loud.** If a choice is arguable, note it in the commit
  or in a comment rather than leaving the next reader to rediscover it.
- **Watch a pull request only when asked.** Never start following CI, and never
  keep a check-in running, off your own initiative.
- **Never ship anything traceable to reference material.** Sample data and
  template names are invented; contact addresses use reserved `.example` domains.

```bash
npm run dev      # http://localhost:5173
npm run gates    # rules a linter can't enforce — see Rules that execute
npm run lint     # eslint + eslint-plugin-svelte; no formatting rules, on purpose
npm test         # vitest, pure-logic units
npm run check    # svelte-check; keep it at zero errors and zero warnings
npm run build    # static output in ./build
npm run verify   # gates, lint, units and types — run this while working
```

## Svelte's own agent tooling

The Svelte team ships skills, a sub-agent and an MCP server for agents working
in Svelte (`npx sv add ai-tools`, `svelte.dev/docs/ai`), kept current with the
framework's releases — which prose in this file cannot be. Prefer it over
anything written here about Svelte itself, and don't vendor a copy of their
files: a copy of someone else's maintained file is stale the day after it is
taken. Take the skills, which are lazy-loaded; treat the MCP server as opt-in,
since its tool definitions cost context every session. `sv add` merges into
`.claude/settings.json`, which this repo already owns — read the diff and keep
the allowlist and the `SessionStart` hook.

What stays here is this project's own taste, which no skill knows about:
Svelte 5 runes, no legacy stores, and everything above.

## Credits

[Dialectic Acheiropoieton](https://heracl.es/libelli) of Heracles Papatheodorou
and&nbsp;Claude
