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

**A clipped box cuts its content, not its chrome.** `overflow: clip` on a box
used to be an inline style on `.box` — the same element the handles, pivot and
badges hang off, so a clipped box ate its own selection chrome. The clip is CSS
now, on `.box.clipped > .content`, because those are all siblings of `.content`
rather than children of it. The alternative was to suppress the clip in the
editor the way `.card.editing` does, but a box is set to clip precisely so its
content is cut at its edge: not cutting it in the editor would break WYSIWYG for
the one setting whose whole purpose is visible. `min-height: 0` on that rule is
load-bearing — a flex item will not shrink below its content height by default,
so without it the content spills out of the fixed-height box and there is
nothing for `overflow` to cut.

**Overflow is a mutation, not a resize.** `measure()` watches the box with a
`ResizeObserver`, which is enough for a growing box and useless for a clipped
one: its height is fixed, so nothing inside it can change its size and the
observer never fires. The overflow warning therefore appeared on exactly the
boxes that did not need it. A `MutationObserver` on the box's subtree catches
the content change itself. It settles rather than looping, because `read()`
writes state only when a number actually moved.

**Bounds carry state; selection is an outline.** Four things want to draw on one
box and there are two pseudo-elements, so the selection moved off `::after` onto
an `outline` on the box itself — the same to look at, no layout cost. That frees
`::after` for the bounds, coloured red when a box is locked and purple when it is
grouped, and `::before` for the padding guide. It also means a state colour is
not painted over the moment the box is selected, which is exactly when you want
to know. Locked wins over grouped, with a coarser dash as well as a different
red, because the overflow corner is red too and two reds a millimetre apart are
one red.

**Every screen mark is drawn against the zoom, and the lines are strokes rather
than borders.** Screen furniture lives inside the card's transform, so a plain
1px line was 0.6px at Fit and 2px at 200%. One `--line` on the card, multiplied
by `--ui-scale` like the handles already were, holds the bounds, the bleed line,
the snap guides, the overflow corner and the badges.

Sizes were easy; weights were not, until the lines stopped being borders. A
browser rounds `border-width` to whole device pixels, so a bound asked for at
1.33px was drawn at 1px and one asked for at 0.5px was drawn at 1px — the weight
could only ever land within half a pixel of its target, and above 100% it could
not thin at all. An SVG stroke is not rounded: `stroke-width: 0.5` is drawn as
half a pixel. So the bounds, the selection ring, the padding guide and the trim
line are each an `<svg><rect>` overlay stroked at `var(--line)`, measured at
exactly one screen pixel at 50%, 75%, 100% and 200%. Dash lengths are expressed
in `--line` too, or the pattern would breathe while the weight held still. The
overlays are `pointer-events: none` and hidden in print — as elements they no
longer fail safe by being inside `@media screen`, and a line on the paper is a
printing error rather than a cosmetic one.

The grid is finer still — a half-pixel hairline in both rules, with the 10mm
rhythm carried by darkness rather than thickness — and keeps its weight for a
different reason: it sits outside the transform and was always measured in screen
pixels.

**A badge is an annotation, not a control.** They are grey on white, smaller than
the blue chrome, and clear of the box rather than straddling its corner, where
they covered the content they were annotating and fought the corner handle for
the same pixels. The badges take pointer events while their column stays
click-through, because the tooltip is the only thing that says what a mark means
and `pointer-events: none` had made it unhoverable — which is how an anchor badge
drawn as four diagonal dashes came to be read as a stray `/` that nobody could
identify. It is a ship's anchor now. A static text area gets a broken chain: its
words live in the template rather than in a column.

**Rotation is dragged from above the top edge.** The centre was taken: the pivot
ring already lives there on a turned box and is dragged to move the turning
point. A rotation handle reads the angle from where the pointer *is* against the
pivot, not from how far it has come, so it is exempt from the un-rotation that
`moveDrag` applies to every other handle — the exemption is a list rather than a
comparison precisely because a new mode otherwise joins the wrong branch in
silence.

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

**A handle is an outline, and the mark is not the target.** Handles have no fill:
they sit on top of the content they resize, and a white square hides the very
edge you are trying to place. The trade-off is that the outline carries the whole
job, so a handle is harder to see on a dark background image than a white square
was. On a coarse pointer the mark halves again — a finger covers what it drags —
while `--reach` grows by the same amount, so the target stays 48px for a handle
and 44px for the pivot. That separation is the point of the `::before`: what you
see and what you can hit are set independently.

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

**Fit measured the thing its own answer resized.** The stage is observed to
derive the scale, the scale sizes the sheet, the sheet's height decides whether a
vertical scrollbar appears, and that scrollbar takes about fifteen pixels off the
width the measurement started from. At a marginal size that oscillates until the
browser's own resize-observer bail-out stops it, and closing Page Setup landed
right in it. `scrollbar-gutter: stable` removes the causal edge rather than
damping the swing; the observer is also coalesced to a frame and held to whole
pixels so it cannot start again for some other reason. Reserving the *horizontal*
gutter would have done nothing — it is the vertical scrollbar that steals width.

**Bare paper counts as empty space.** Clicking away from everything is how a
canvas editor deselects, and stopping at the page edge — grey ground yes, the
paper no — made it look broken. A box swallows its own pointerdown, so widening
the test only ever catches ground nobody owns.

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

**The sample rows are the tour.** A first run lands on four cards that explain
the app rather than on invented filler, because they are the first thing anyone
sees and they are rendered by the very machinery they describe: a row is a card,
a column is a field, the Markdown subset is on the page in front of you. Card 2
leaves its `link` cell empty on purpose, so its QR disappears and the card can
point at the gap — one row teaching `hideWhenEmpty` by not having it. They stay
inside what `markdown.ts` actually supports, and the QR URLs are decoded by an
independent decoder in the verification pass, because a QR that does not scan
looks exactly like one that does.

**Press and hold Import to bring them back.** The actions bar is deliberately one
line, so a fifth button would cost the table a row of its own height every time
the tray narrowed; the gesture hangs off the button whose job is closest. A held
mouse button and a held finger are the same pointer events, so there is no
separate touch path, and the click that follows a completed hold is swallowed or
the file picker would open on top of the rows just loaded. It replaces the data
and leaves the template alone — it hangs off an import-*data* button — and it
does not ask, because a snapshot carries data as well as design and Ctrl/Cmd+Z
reaches it. A hidden gesture costs discoverability, which is paid back in the
button's `title`, the Help dialog and the README rather than in the bar.

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

## `src/lib/fonts.ts`

**A font is asked for when it is chosen, not when the app starts.** Requesting a
family only at boot and on import meant choosing one from a dropdown wrote the
name into the template and stopped there: nothing fetched the face, the box fell
back to the system stack, and the choice appeared to work only after the next
reload. The effect that fixes it is keyed on the set of families in use rather
than on the pickers, so a new way of choosing a font cannot forget to ask. An
area whose family has not arrived pulses, because a box drawn in the fallback
face is indistinguishable from a box whose font never applied.

**A family name is a name.** `boxStyle` joins its parts with `;` into an inline
style attribute, so a template carrying `"font": "X; color: red"` wrote extra
declarations into every box — `box.font` was the one string reaching a style
attribute without passing a chokepoint. A name that does not look like one is
refused outright rather than cleaned, because a half-cleaned name is a family
nobody asked for.

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

**A new area is provisional until it is given something.** It used to arrive
carrying the literal word "Text", so abandoning one left a box on the card that
said Text and had to be hunted down. It starts empty with the cursor already in
the Text field, and is dropped again unless it is given words, a column, or a
change to how it looks. Moving and resizing do not count: placing a box is what
you do while deciding whether you want it at all.

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
