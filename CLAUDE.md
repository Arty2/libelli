# CLAUDE.md

Notes for whoever — human or model — picks this up next. What libelli is, how it
is built, and how the two of us work on it.

## What this is

A front-end-only SvelteKit app that turns spreadsheet rows into print-ready
cards. Paste or import a table, bind columns to boxes on a WYSIWYG page, print
one card per row. No backend, no accounts, no uploads; `adapter-static` output
that any static host will serve.

`PLAN.md` holds the original decisions, `README.md` explains the app to a user.
This file is about working on it.

## Shape of the code

```
src/lib/
  types.ts        template + runtime types; every coordinate is mm, font sizes are pt
  colour.ts       the only place a colour string is allowed to become CSS
  css.ts          scopes the template's own CSS to the card; strips @import and remote url()
  parse.ts        CSV / TSV parsing (quoted fields, embedded newlines, delimiter sniffing)
  markdown.ts     hand-written Markdown subset -> HTML, escaping at the leaves
  layout.ts       mm geometry, anchor resolution, grid and sibling-edge snapping
  icons.ts        IBM Carbon icon paths (Apache-2.0), inlined rather than depended on
  png.ts          card -> PNG via SVG foreignObject; inlines stylesheets and stored fonts
  qr.ts           QR encoding (byte mode, versions 1-10) -> SVG
  table.ts        column reorder, row sorting
  download.ts     hand the browser a file; the one copy both exports use
  template.ts     defaults, validation, migration, import/export
  fonts.ts        Google families + local files via FontFace/IndexedDB
  assets.ts       background images: bytes in IndexedDB, object-URL lifetime, url() safety
  history.ts      undo/redo snapshots
  storage.ts      localStorage + IndexedDB, plus the legacy-key migration
  onboarding.ts   the starter template and sample rows a first run lands on
  version.ts      VERSION, and the bumping rule
  components/     Card, PagePreview, DataTable, OptionsBar, PrintPreview, PrintRoot, BoxMenu,
                  SelectionTools, Icon
src/routes/+page.svelte   all app state and wiring
static/sample-cards.csv   sample data, bundled with ?raw and also served as a file
```

Load-bearing choices, in case they look arbitrary:

- **Millimetres everywhere.** Coordinates are measured from the trim edge, so
  changing page size or enabling bleed moves nothing. Bleed is an outset on the
  page, never an offset on content.
- **Anchors, resolved after measurement.** A box can take its top from another
  box's *rendered* bottom. A hidden box drops out of the chain entirely, so a
  card with no subtitle has no dead band. `anchor: null` pins a box to its own
  `y` — that is how the footer stays put however long the body runs.
- **DOM rendering, browser printing.** The editor and the printed page share one
  layout engine, so they cannot drift. `@page { size: <w>mm <h>mm; margin: 0 }`.
- **No runtime dependencies.** The Markdown renderer, the CSV parser and the QR
  encoder are hand-written, so the app works offline and nothing can rot
  underneath it. `jsqr` is a dev dependency only: the tests decode generated
  codes with an independent decoder, because a QR that does not scan looks
  exactly like one that does.
- **Escaping, colour parsing and CSS scoping are chokepoints.** Cell content is
  untrusted: every leaf text node is HTML-escaped in `markdown.ts`, and every
  colour goes through `colour.ts` before it can reach a `style` attribute —
  `template.ts` runs each of a box's colours through it on load, and one it does
  not recognise is dropped rather than guessed at. A
  template is a file someone can hand you, so its custom CSS goes through
  `css.ts`, which prefixes every selector with the card's scope and strips
  `@import` and any non-`data:` `url()` — the app fetches nothing, and a template
  must not be able to change that. Note that `css.ts` also builds the `<style>`
  tag: a literal `<style>…</style>` pair written in a `.svelte` file gets picked
  up by the Svelte toolchain as that component's own stylesheet.
- **Both option bars read in groups**, outward from the subject: what the thing
  is, then its type, then how it looks, then where it sits, then what you can do
  to it. A new control goes in the group it belongs to rather than on the end.
- **Controls sit next to what they act on.** Undo and redo are a column at the
  page's top-left corner, with stacking order under them whenever anything is
  selected and the multi-selection tools under that; *+ Area* is at the
  top-right, the view toggles are along the bottom edge and the card pager sits
  under the sheet. The window toolbar holds only what is about the whole app.
  Tools that come and go with a
  selection belong on that rail rather than in the options bar, where they would
  shove every other control sideways each time a second box was picked up. A right-click menu on a box carries
  the same actions its bar does — neither is the only way to reach them. Only
  the primary pointer button drags: a right-click that started one would collapse
  a multi-selection before the menu it opened could act on the rest.
- **A box's content source is read, not stored.** A bound box has a `slot` and
  anything else carries its own `static` content. Storing that as a third field
  would only give it something to disagree with. There is no separate
  "decorative" source: a static box with nothing typed into it still draws its
  fill, its border and its size, and `hideWhenEmpty` is what takes it away —
  two settings that already existed, rather than a third state to keep in step.
- **A group is a shared name, not a container.** `Box.group` keeps the box list
  flat, so grouping cannot disturb anchoring, stacking or measurement; selecting
  one member expands to the whole group in `selectBox`. `alignBoxes` works on
  declared geometry and releases the anchor of a box it moves vertically —
  an anchor would otherwise undo the alignment on the next render.
- **Stacking is array order**, not a z-index: `arrangeBoxes` moves boxes within
  the list, and returns the same array when there is nowhere to go so no undo
  entry is recorded for a no-op. Several move as a block; front and back gather
  them, forward and backward step each past its unselected neighbour, walking
  from the end being moved towards so they cannot swap past each other.
- **Radii are tokens.** `--radius-button` (3px) and `--radius-input` (1px) on
  `:root`; a surface (modal, menu, chip) keeps its own larger radius.
- **A box's content lives in `.content`.** Handles and badges are absolutely
  positioned children of `.box` that hang past its edges, so measuring the box's
  own `scrollHeight` reports overflow on every selected box. The wrapper is what
  gets measured, and it is also the single flex item `justify-content` places.
- **One door to the printer.** Print opens the preview; the preview prints. The
  page selection lives there, keyed by row index and reset every time it opens —
  sorting or deleting a row moves those indices, and a stale exclusion would drop
  a different card than the one that was unticked.
- **A lock stops a box moving, not being picked.** `startDrag` selects before it
  checks whether the box is editable, or the only control that could unlock a
  box would be unreachable.
- **The PNG export is the one thing that fetches.** `png.ts` inlines a Google
  face by fetching the stylesheet the page already loaded and the files it names.
  Deliberate, confined to that file, and best effort — a blocked request falls
  back to the system stack and is reported rather than hidden.
- **A lock is a button in the bar and an indicator on the canvas.** The padlock
  on a box or a page says *locked*; it is never the control, because the control
  belongs with the rest of that subject's settings. The button that sets a lock
  is never disabled by the lock it sets.
- **A box is `border-box`.** Padding and a border are drawn inside the
  millimetres the box was given, so framing one never moves it sideways. It does
  make the box taller, which `measure()` picks up and anchored boxes below
  follow — that is the intended behaviour, not a leak. A border width is one
  number or four, and so is a padding; `normaliseSides` collapses four equal
  edges back to one, so a template never grows structure it did not ask for.
  `sidesOf` reads either shape back out as four edges.
- **Vertical alignment makes a box a flex column.** That is why `.box` is
  `display: flex`: `justify-content` is the only thing that places content
  vertically in a box whose height may be a `min-height`. The cost is that child
  margins no longer collapse out of the box, which the existing
  `:first-child { margin-top: 0 }` rules already absorb. Measurement is
  unaffected — `measure()` reads the box's own `offsetHeight`.
- **Big things are referenced, never embedded.** A template names a font family
  and a background image; the bytes live in IndexedDB, keyed by that name, and a
  file the browser has never been given is asked for rather than substituted.
  That is what keeps a template small enough to paste into a message, and it is
  why `Card` takes a *resolved* background as a prop — reading bytes back is
  asynchronous, and the component has to stay a pure function of its props.
  `assets.ts` also owns object-URL lifetime: an object URL outlives the value
  that made it, so each is revoked when replaced.
- **One wheel listener, two gestures.** `Ctrl`/`Cmd` and the wheel zooms the
  page; add `Shift` and it sizes the type under the pointer instead. Both are
  `preventDefault`ed by the same non-passive listener on the stage, because the
  browser would otherwise zoom itself underneath either of them. Wheel deltas
  are accumulated and spent a point at a time: a mouse notch is one fat event
  and a trackpad is a stream of small ones, so reading them one-for-one would
  make the same flick one step on one machine and forty on another.
- **The editor does not clip, the output does.** `.card` is `overflow: hidden`
  so a print or a PNG never spills onto its neighbour; `.card.editing` — the
  interactive preview only — turns that off, so a box dragged past the edge
  stays visible and stays grabbable. Losing the handles of something you can no
  longer see is worse than being shown what will not print, and the trim edge
  already says where the paper stops.
- **Screen furniture is sized in screen pixels.** Handles and the pivot live
  inside the scaled card, so a 14px handle is nine pixels under the finger at
  62%. `--ui-scale` on `.card` is `1 / scale`, and every screen-only measure is
  multiplied by it, so a target is the size it was drawn at whatever the zoom.
- **Snapping is the two view toggles, not a modifier.** The grid beats sibling
  edges, sibling edges beat plain `FREE_STEP` rounding, and there is no key to
  hold: Grid off and Bounds off is free movement, because a box must never latch
  onto a guide that is not being drawn — a snap to an invisible edge reads as a
  bug. Sibling edges come from `resolveLayout`, so a box snaps to where a grown
  box actually ends. An anchored box always snaps its `gap`, never its `y`.
  `snapTo` rounds after the multiply: `1529 * 0.01` is 15.290000000000001, and
  that number would otherwise reach the field and the exported template.
- **Clearing a field means removing it.** "Inherit the page default", "no fill",
  "no border" are all expressed as an absent key, so `updateBox` strips undefined
  values: structured clone, unlike JSON, keeps an undefined-valued key, and a box
  would otherwise silt up with dead fields.
- **Undo is snapshots, not a command log.** One entry is the whole editable
  state (template + data + mapping), recorded on a debounce. An inverse
  operation cannot drift out of step with the operation it undoes.
- **`$state.raw` for history.** A deep state proxy over the snapshots cannot be
  cloned back into the app — that bug cost a debugging round, so it has a
  comment on it.

## Versioning

`src/lib/version.ts` is the source of truth; keep `package.json` in step.

- Fix or small change: patch — `0.1.0` → `0.1.1`
- Feature: minor — `0.1.1` → `0.2.0`
- **The leading zero never moves.** This is a vibe-coded app, always in flux; it
  does not claim to be 1.0.
- **Bump once per session, not once per change.** A session is one release
  however many commits it takes: set the number when the work starts landing and
  leave it alone, so the follow-ups and corrections that always follow do not
  each claim a version of their own. Size the single bump by the largest change
  in the session — one feature among five fixes still makes it a minor. Bump
  again within a session only when asked to.

## How we work

- **Build the risky thing first.** Rendering and printing were proven on day one,
  before any editor UI existed.
- **Verify in a real browser, not just in tests.** Every feature here has been
  driven in headless Chromium — geometry read back in mm, PDFs counted page by
  page, dialogs opened and dismissed. Say what was actually checked, and say it
  plainly; if something was not checked, say that too.
- **Tests cover the pure logic.** `parse`, `markdown`, `layout`, `template`,
  `history`, `colour`, `css`, `assets`, `qr`, `table` have unit tests. Components are verified by driving them.
- **Small commits with real messages.** What changed, why that shape, and what
  was verified. No model names in anything that lands in the repo.
- **Comments explain the why.** Not what the line does — why it is that way, and
  what breaks otherwise. Delete a comment that only restates the code.
- **British spelling in prose and in identifiers** (`colour`, `normalise`),
  except where a web API forces `color`.
- **Say the trade-off out loud.** If a choice is arguable, note it in the commit
  or in a comment rather than leaving the next reader to rediscover it.
- **Never ship anything traceable to reference material.** Sample data and
  template names are invented; contact addresses use reserved `.example` domains.
- **Rotation is a transform, so it costs no layout.** `rotation` is degrees and
  `centre` is the pivot in *percent* of the box — the one thing in the format
  that is not mm, because a pivot in mm drifts towards a corner as the box
  grows. A CSS transform leaves `offsetHeight` alone, so `measure()`, anchoring
  and snapping all see the upright rectangle: turning one area never shuffles
  the rest of the card. The cost is that a resize handle on a turned box hands
  back a screen-space delta, which `moveDrag` rotates by −θ before reading it as
  a width; `move` is exempt, because a translation in the parent's space is the
  same whichever way the box faces.
- **A handle's target is a pseudo-element, not a box-shadow.** A transparent
  `box-shadow` looks like a bigger hit area and is never hit-tested. `::before`
  with a negative inset is, and it grows again under `pointer: coarse`.
- **A new box starts clipped.** `newBox` defaults `overflow` to `clip`, so an
  area keeps the millimetres it was given until someone asks it to reflow. The
  starter template's title and body say `grow` for themselves.
- **Destructive things are undoable, and only ask when undo cannot reach them.**
  Deleting a row, a column or a box happens straight away and says so; Reset asks
  twice, because it clears browser storage and uploaded fonts that no undo can
  bring back.

## Working commands

```bash
npm run dev      # http://localhost:5173
npm test         # vitest, pure-logic units
npm run check    # svelte-check; keep it at zero errors and zero warnings
npm run build    # static output in ./build
```

## Credits

[Dialectic Acheiropoieton](https://heracl.es/libelli) of Heracles Papatheodorou
and&nbsp;Claude
