# AGENTS.md

Notes for whoever — human or agent — picks this up next. `CLAUDE.md` imports
this file; edit this one.

`README.md` is the app as a user meets it, `docs/decisions.md` the why behind
each module, `PLAN.md` the original decisions (historical). **This file is only
what you need before touching anything**, read in full every session, so it is
kept short: push detail into `docs/decisions.md`, and `npm run gates` holds this
file to a line budget.

## What this is

A front-end-only SvelteKit app that turns spreadsheet rows into print-ready
cards. Paste or import a table, bind columns to boxes on a WYSIWYG page, print
one card per row. No backend, no accounts, no uploads; `adapter-static` output
that any static host will serve.

## Shape of the code

Line counts are marked where a file is big enough that opening it is a decision.

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
  gestures.ts     swipe; tooltip.ts where a tip goes; haptics.ts the buzz for a press
  complete.ts     the column names `{{` offers; placeholders.ts what `{{name}}` resolves to
  modal.ts        the two-Enter rule every dialog with a default action shares
  icons.ts        IBM Carbon icon paths (Apache-2.0), inlined rather than depended on
  png.ts          card -> PNG via SVG foreignObject; inlines stylesheets and stored fonts
  qr.ts           QR encoding (byte mode, versions 1-10) -> SVG
  hand.ts         a border drawn by hand: seeded wobble -> SVG paths, in mm
  bitmap.ts       the pixel budget a drawn area gets, and pointing at it
  tile.ts         a drawing cropped to its ink, for an area that repeats
  photo.ts        crop frames and write-back types, for editing a stored picture
  table.ts        column reorder, row sorting
  imposition.ts   tiling cards onto a sheet, in reading order or a zine's fold
  download.ts     hand the browser a file; zip.ts packs several into one
  template.ts     defaults (templates/default-card.json), validation, migration, import/export
  fonts.ts        Google families + local files via FontFace/IndexedDB
  assets.ts       images — page backgrounds and a row's own; bytes in a folder or IndexedDB
  history.ts      undo/redo snapshots
  storage.ts      localStorage + IndexedDB, the template library, the legacy-key migration
  onboarding.ts   the starter template and sample rows (sample-cards.csv) a first run lands on
  sw-policy.ts    what the service worker does with a request, kept testable
  pwa.ts          worker registration, the update handshake, the install offer
  version.ts      VERSION, and the bumping rule
  components/
    Card.svelte         the card itself: boxes, handles, drag, snap            (~3k)
    PagePreview.svelte  the stage: zoom, wheel gestures, the pager             (~1.8k)
    DataTable.svelte    the side panel: the table, a cell full size, drawing   (~3.2k)
    OptionsBar.svelte   shell; picks PageOptions or BoxOptions (~1.4k), options-bar.css
    PrintSettingsPanel.svelte  Per Sheet, orientation, sheet background — shared with the print screen
    PrintSheet.svelte   one physical sheet — off-screen in PrintRoot, thumbnails in PrintPreview
    Lightbox / SheetLightbox  one card, or one sheet, full screen
    BitmapEditor.svelte the drawing surface, hosted in DataTable; saves a base64 PNG
    ImagesPanel.svelte  stored pictures, their weight, the folder; one large, to crop or turn
    Tooltip.svelte      every `title` as a tip: hover, or press and hold on touch
    PrintRoot, BoxMenu, SelectionTools, MenuSelect, ColorField, Icon
src/service-worker.ts     the offline cache, thin over sw-policy
src/routes/+page.svelte   app state and wiring                                 (~4k)
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
  through these, not just that the guards work — keep it that way.
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
re-read it. So every rule above that *can* be checked is, in `scripts/gates.sh`
(`npm run gates`, first in CI) — injection sinks, `{@html}` outside Card,
PrintRoot and Icon, `fetch` outside `png.ts` and the worker, runtime
dependencies, `vercel.json`'s security headers, `colour` as a name, `VERSION`
against `package.json`, this file's length. ESLint (`npm run lint`, next in CI)
covers what a linter can; where a rule is off, `eslint.config.js` says why.

Add the next rule to the script, not as a paragraph here — `docs/decisions.md`
§ `scripts/gates.sh` has the conventions. Each run appends a line to the
gitignored `.claude/logs/gates.jsonl`, so "this gate never fires" is answerable.

## Versioning

`src/lib/version.ts` is the source of truth; keep `package.json` and
`package-lock.json` in step. Patch for a fix, minor for a feature, and **the
leading zero never moves** — README has the table.

**Bump once per session, not once per change**, sized by the largest change in
it — one feature among five fixes is still a minor. Set it when the work starts
landing and leave it; bump again only when asked. **Once the session has a pull
request open, every further push bumps the patch** (`0.8.0` → `0.8.1` → …): a
reviewer may already have read the last one.

## How we work

- **Verify in a real browser, not just in tests** — drive it in headless
  Chromium, and say plainly what was checked and what was not. Scripts and
  screenshots go in a scratch directory outside the repository: read
  `git status` before any `git add -A`, and commit nothing you did not write on
  purpose.
- **Read what the build emitted, not the config you wrote.** A config option
  that is silently dropped looks exactly like one that works. After a change to
  anything the toolchain rewrites — the service worker's precache list, the
  prerendered HTML, the static output — open the file in `build/` and check the
  change is actually in it.
- **Build the risky thing first.** **Tests cover the pure logic**; components are verified by driving them.
- **Small commits with real messages.** What changed, why that shape, and what
  was verified. No model names in anything that lands in the repo.
- **Comments explain the why.** Not what the line does — why it is that way, and
  what breaks otherwise. Delete a comment that only restates the code.
- **British spelling in prose and in identifiers** (`normalise`, `centre`) —
  except **`color`** wherever it names the thing: the CSS property, the module,
  every identifier, the control's label, as the web platform and the format's
  own `Box.color` spell it. Ordinary prose keeps its `u` ("the paper colour"),
  and that is where the gate draws the line.
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

## Svelte

Svelte 5 runes, no legacy stores. For Svelte itself, prefer the Svelte team's
maintained agent docs (`svelte.dev/docs/ai`) over anything written here, and
don't vendor a copy of them. If you add them with `npx sv add ai-tools`, it
merges into `.claude/settings.json` — keep the allowlist, the deny and the
`SessionStart` hook.
