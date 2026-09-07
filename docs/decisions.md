# Decisions

The why behind the code, filed under the module it concerns. `CLAUDE.md` carries
the handful of rules that apply everywhere; this is everything else — read the
section for the file you are about to change, not the whole thing.

`PLAN.md` holds the original decisions and is a historical document: where its
file layout disagrees with the tree in `CLAUDE.md`, the tree is right.

## `src/lib/layout.ts`

**Anchors, resolved after measurement.** A box can take its top from another
box's *rendered* bottom. A hidden box drops out of the chain entirely, so a card
with no subtitle has no dead band. `anchor: null` pins a box to its own `y` —
that is how the footer stays put however long the body runs.

**`snapTo` rounds after the multiply.** `1529 * 0.01` is 15.290000000000001, and
that number would otherwise reach the field and the exported template.

**Sibling edges come from `resolveLayout`**, so a box snaps to where a grown box
actually ends, not to where its declared geometry says it starts.

## `src/lib/template.ts`

**Stacking is array order**, not a z-index: `arrangeBoxes` moves boxes within the
list, and returns the same array when there is nowhere to go so no undo entry is
recorded for a no-op. Several move as a block; front and back gather them,
forward and backward step each past its unselected neighbour, walking from the
end being moved towards so they cannot swap past each other.

**A new box starts clipped.** `newBox` defaults `overflow` to `clip`, so an area
keeps the millimetres it was given until someone asks it to reflow. The starter
template's title and body say `grow` for themselves.

**A border width is one number or four, and so is a padding.** `normaliseSides`
collapses four equal edges back to one, so a template never grows structure it
did not ask for; `sidesOf` reads either shape back out as four edges.

## `src/lib/types.ts`

**A box's content source is read, not stored.** A bound box has a `slot` and
anything else carries its own `static` content. Storing that as a third field
would only give it something to disagree with. There is no separate "decorative"
source: a static box with nothing typed into it still draws its fill, its border
and its size, and `hideWhenEmpty` is what takes it away — two settings that
already existed, rather than a third state to keep in step.

## `src/lib/components/Card.svelte`

**A box's content lives in `.content`.** Handles and badges are absolutely
positioned children of `.box` that hang past its edges, so measuring the box's
own `scrollHeight` reports overflow on every selected box. The wrapper is what
gets measured, and it is also the single flex item `justify-content` places.

**Vertical alignment makes a box a flex column.** That is why `.box` is
`display: flex`: `justify-content` is the only thing that places content
vertically in a box whose height may be a `min-height`. The cost is that child
margins no longer collapse out of the box, which the existing
`:first-child { margin-top: 0 }` rules already absorb. Measurement is unaffected
— `measure()` reads the box's own `offsetHeight`.

**A box is `border-box`.** Padding and a border are drawn inside the millimetres
the box was given, so framing one never moves it sideways. It does make the box
taller, which `measure()` picks up and anchored boxes below follow — that is the
intended behaviour, not a leak.

**Screen furniture is sized in screen pixels.** Handles and the pivot live inside
the scaled card, so a 14px handle is nine pixels under the finger at 62%.
`--ui-scale` on `.card` is `1 / scale`, and every screen-only measure is
multiplied by it, so a target is the size it was drawn at whatever the zoom.

**A handle's target is a pseudo-element, not a box-shadow.** A transparent
`box-shadow` looks like a bigger hit area and is never hit-tested. `::before`
with a negative inset is, and it grows again under `pointer: coarse`.

**A lock stops a box moving, not being picked.** `startDrag` selects before it
checks whether the box is editable, or the only control that could unlock a box
would be unreachable.

**Rotation is a transform, so it costs no layout.** `rotation` is degrees and
`centre` is the pivot in *percent* of the box — the one thing in the format that
is not mm, because a pivot in mm drifts towards a corner as the box grows. A CSS
transform leaves `offsetHeight` alone, so `measure()`, anchoring and snapping all
see the upright rectangle: turning one area never shuffles the rest of the card.
The cost is that a resize handle on a turned box hands back a screen-space delta,
which `moveDrag` rotates by −θ before reading it as a width; `move` is exempt,
because a translation in the parent's space is the same whichever way the box
faces.

**Snapping is the two view toggles, not a modifier.** The grid beats sibling
edges, sibling edges beat plain `FREE_STEP` rounding, and there is no key to
hold: Grid off and Bounds off is free movement, because a box must never latch
onto a guide that is not being drawn — a snap to an invisible edge reads as a
bug. An anchored box always snaps its `gap`, never its `y`.

**The editor does not clip, the output does.** `.card` is `overflow: hidden` so a
print or a PNG never spills onto its neighbour; `.card.editing` — the interactive
preview only — turns that off, so a box dragged past the edge stays visible and
stays grabbable. Losing the handles of something you can no longer see is worse
than being shown what will not print, and the trim edge already says where the
paper stops.

## `src/lib/components/PagePreview.svelte`

**One wheel listener, two gestures.** `Ctrl`/`Cmd` and the wheel zooms the page;
add `Shift` and it sizes the type under the pointer instead. Both are
`preventDefault`ed by the same non-passive listener on the stage, because the
browser would otherwise zoom itself underneath either of them. Wheel deltas are
accumulated and spent a point at a time: a mouse notch is one fat event and a
trackpad is a stream of small ones, so reading them one-for-one would make the
same flick one step on one machine and forty on another.

**The pager reserves its own height.** The sheet and the pager are one column, so
`fit` subtracts the pager's measured height and the column gap before it sizes
the page — otherwise the count is the first thing off the bottom of a short
stage. Measured, not assumed: it is text and icons, and it is absent when there
are no rows.

**Controls sit next to what they act on.** Undo and redo are a column at the
page's top-left corner, with stacking order under them whenever anything is
selected and the multi-selection tools under that; *+ Area* is at the top-right,
the view toggles are along the bottom edge and the card pager sits under the
sheet. The window toolbar holds only what is about the whole app. Tools that come
and go with a selection belong on that rail rather than in the options bar, where
they would shove every other control sideways each time a second box was picked
up.

## `src/lib/components/DataTable.svelte`

**The table follows the pager, and does not take focus.** Paging the card scrolls
the active row into view with `block: 'nearest'`, which leaves a row already on
screen exactly where it is. Focus stays on the arrow being pressed: moving it to
the row would break the second press.

## `src/lib/components/Lightbox.svelte`

**The lightbox is not a door to the printer.** `Lightbox` is one card, big, over
everything, and it prints and exports nothing — so it opens from the count under
the page as well as from an export thumbnail, without making a second way to the
printer. Both callers own the index and hand it back, so the card you were
looking at is the card you land on when it closes. It takes Escape and the arrows
for itself while it is open, and every screen underneath it stands down on those
keys rather than racing it. The tilt is a transform on the card's wrapper:
nothing under it moves, `prefers-reduced-motion` and a fine pointer both switch
it off entirely, and the first reading is the baseline so however the phone is
being held when it opens is level.

## `src/lib/components/PrintPreview.svelte`

**One door to the printer.** Print opens the preview; the preview prints. The
page selection lives there, keyed by row index and reset every time it opens —
sorting or deleting a row moves those indices, and a stale exclusion would drop a
different card than the one that was unticked.

## `src/lib/sw-policy.ts` and `src/service-worker.ts`

**The worker only ever touches same-origin GETs.** `sw-policy.ts` decides, and it
passes everything cross-origin straight through: the app promises to fetch
nothing, and a cache full of somebody else's bytes would quietly break that
promise in a place nobody thinks to look. It also never skips waiting on its own
— the undo stack is in memory, so a worker that swapped itself in would force a
reload that threw the stack away. The page offers a Reload instead.

**Precaching fetches with `cache: 'reload'`**: the shell is the one URL that never
changes between builds, so a cached copy of it names the *previous* build's
hashed assets, and activate has just binned the cache those lived in.

## `src/lib/png.ts`

**The PNG export is the one thing that fetches.** `png.ts` inlines a Google face
by fetching the stylesheet the page already loaded and the files it names.
Deliberate, confined to that file, and best effort — a blocked request falls back
to the system stack and is reported rather than hidden.

## `src/lib/assets.ts` and `src/lib/fonts.ts`

**Big things are referenced, never embedded.** A template names a font family and
a background image; the bytes live in IndexedDB, keyed by that name, and a file
the browser has never been given is asked for rather than substituted. That is
what keeps a template small enough to paste into a message, and it is why `Card`
takes a *resolved* background as a prop — reading bytes back is asynchronous, and
the component has to stay a pure function of its props.

**`assets.ts` owns object-URL lifetime**: an object URL outlives the value that
made it, so each is revoked when replaced.

## `src/lib/components/OptionsBar.svelte`

**Both option bars read in groups**, outward from the subject: what the thing is,
then its type, then how it looks, then where it sits, then what you can do to it.
A new control goes in the group it belongs to rather than on the end.

**A right-click menu on a box carries the same actions its bar does** — neither is
the only way to reach them. Only the primary pointer button drags: a right-click
that started one would collapse a multi-selection before the menu it opened could
act on the rest.

**A lock is a button in the bar and an indicator on the canvas.** The padlock on a
box or a page says *locked*; it is never the control, because the control belongs
with the rest of that subject's settings. The button that sets a lock is never
disabled by the lock it sets.

## `src/lib/boxops.ts` and `src/routes/+page.svelte`

**A group is a shared name, not a container.** `Box.group` keeps the box list
flat, so grouping cannot disturb anchoring, stacking or measurement; selecting one
member expands to the whole group in `selectBox`. `alignBoxes` works on declared
geometry and releases the anchor of a box it moves vertically — an anchor would
otherwise undo the alignment on the next render.

**Destructive things are undoable, and only ask when undo cannot reach them.**
Deleting a row, a column or a box happens straight away and says so; Reset asks
twice, because it clears browser storage and uploaded fonts that no undo can
bring back.

## Testing

Tests cover the pure logic. Components are verified by driving them in a real
browser, which is the project's standing rule and not a substitute for it.

Two things worth knowing before trusting a green run:

- **Some tests assert on generated CSS rather than behaviour** —
  `markdown.test.ts` on `font-size`, `margin` and the ordered-list marker,
  `qr.test.ts` on an exact `viewBox`. A cosmetic change to either renderer breaks
  them without a real regression. Left as-is because the alternative is parsing
  the output, but do not read such a failure as a bug before looking.
- **`assets.ts`'s object-URL revoke-then-recreate is never exercised**, because it
  needs `Blob`, `URL.createObjectURL` and `indexedDB`. It is the one place where
  "needs no DOM" and "is tested" come apart, and it is why the suite stays on
  `environment: 'node'` without that being a claim of coverage.
