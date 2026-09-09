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

## `src/lib/imposition.ts`

**No second bleed.** Several cards on one sheet need a gap between neighbours
and a mark showing where to cut — exactly what `template.bleed` already
gives one card against the paper edge. Tiling cards edge to edge, with no
extra gutter, means that gap and those marks fall out of the per-card bleed
`Card.svelte` already draws at its own corners, so imposition adds a sheet
size and a count and touches nothing about bleed itself.

**A grid's footprint does not depend on its shape.** `cardW * cols` by
`cardH * rows` covers `cardW * cardH * count` either way round, so it was
never a real tiebreak between orientations — an earlier version compared
block area to pick a "best" grid, which was comparing numbers that could
never differ. What genuinely varies by orientation is the *scale* a card
needs to fit at all, so that is what `resolveImposition` now scores: every
orientation is tried, each capped at `scale <= 1` (imposition shrinks, it
never enlarges), and the one needing the least shrinkage wins — a tie falls
to whichever `GRIDS` lists first, the more balanced arrangement (2x2 before
4x1).

**Scaling for print is not the same promise as "millimetres everywhere."**
That rule is about the *design*: a box's coordinates do not move when the
page size or bleed changes, so the editor stays predictable. Printing four
A5 cards onto one A4 sheet needs them smaller than their own trim size in
no orientation — refusing was the original call, but a print run that
quietly comes out 1-up when you asked for 4-up is worse than one that comes
out a little smaller. So `resolveImposition` always returns a layout when
imposition is on, `scale` included, and never `undefined` — printing is the
one place a card's millimetres are not the final word; the editor, a single
card's own print, and every other reader of `template.page` never see
anything but the number that was typed in. `PrintSheet.svelte` renders each
card at its own full size and then scales the wrapping element down with a
plain CSS `transform`, so nothing about layout, anchors or measurement
changes — only what ends up on paper. `PrintSettingsPanel.svelte` shows the
percentage rather than staying silent about it.

**The sheet's own background is a second, separate reference.** A card's
background (`template.page.image`) and the sheet's (`template.print.background`)
are stored, resolved and asked-for-when-missing exactly the same way, but as
two independent fields — the sheet's is `undefined` far more often (only
imposition draws a sheet distinct from the card), and conflating them would
mean turning imposition off could silently reach for a picture nobody chose
for that context.

## `src/lib/history.ts`

**A label rides alongside each state, never inside it.** States are compared by
value to decide whether anything changed, and that comparison is what stops an
applied undo recording itself straight back — so a label folded into the snapshot
would make two identical states look different and break undo. Entries are
`{ state, label }` and only `state` is compared.

A label describes the step *into* a state, so undo names the present it is
leaving and redo names the entry it is about to restore.

The recorder watches state and cannot know what changed, so actions leave their
name in a pending slot on the way past. **The first name wins until it is
consumed**: the debounce has no maximum wait, so two actions inside a third of a
second become one entry, and the first is the one the user thinks they did.
Undo and redo clear the slot, or a label left pending when they land would
attach itself to whatever came next.

That policy is also why a drag names itself on its first *movement* rather than
at pointerdown: selecting a box goes through `startDrag` too, so naming it there
labelled every click "Move", and a click followed by an arrow key was then
recorded as a drag.

## `src/lib/components/Card.svelte`

**A crop mark is two ticks with a gap, not an L of borders.** These were a
corner-sized box carrying two borders, so the two lines met exactly at the
trim corner — the one point a guillotine operator is lining up on, and a mark
touching the artwork there cannot be told from a rule the design meant to
have. Each tick now lies on its own trim line, runs outward into the bleed,
and stops 1mm short of the corner. The gap is along the tick's own direction
only: the lines stay *on* the trim, because that is what makes them a
straightedge to cut against. `max(0mm, …)` on the length is what keeps a bleed
thinner than the gap from drawing a negative mark.

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

**Anchoring shows at both ends, and moves at both ends.** A box that hangs off
another wears a link; the box it hangs from wears a harbour buoy. Until now only one
end was visible, and the box being followed gave no sign that moving it would
take anything with it. Moving it now does take them: `resolveLayout` already
carried dependents *downwards*, because their top is read from the target's
bottom, so a drag hands them the sideways half of the move and nothing else —
applying the vertical delta as well would move them twice.

**The overflow corner is a badge that happens to be red.** Same size, radius and
standing-clear-of-the-edge as the others, at the bottom right where the words run
out rather than in the column of reasons at the top right, and hoverable like the
rest: it was `pointer-events: none`, so the title explaining it could never be
read. Shears rather than a warning triangle, because what is happening to the
words is that they are being cut.

**Bounds carry state; selection is an outline.** Four things want to draw on one
box and there are two pseudo-elements, so the selection moved off `::after` onto
an `outline` on the box itself — the same to look at, no layout cost. That frees
`::after` for the bounds, colored red when a box is locked and purple when it is
grouped, and `::before` for the padding guide. It also means a state color is
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

**The pivot is a crosshair, the lever a knob.** They sit a few pixels apart and
do different things, so two blue circles meant reading them by remembering which
was further out. A cross is what a point is drawn as, and it is unmistakable next
to a knob. Its arms are background gradients rather than borders, for the same
reason the box outlines are strokes: a gradient honours a sub-pixel width where a
border is rounded to whole device pixels, so the arms come out the same weight as
every other line on the card at any zoom. Three shapes, three jobs — rounded
square for resize, cross for the point, circle for the swing.

**Turning is a lever on the pivot.** A rotation handle on the box edge said
nothing about where the box would actually turn, because the pivot moves. So the
two controls sit together: the pivot ring is dragged to move the point turned
about, and a knob on a short arm off it is swung to turn the box. Both hang off
the pivot, so they travel with it, and both are inside the box, so the lever
leans the way the box does.

Being at arm's length is not decoration. Rotation dragged *from* the pivot begins
at the one point where the angle to the pointer does not exist — a swing that
should have read 45° came out as -86° — and just outside it a pixel of movement
swings the box through tens of degrees. A lever has an angle to measure from the
first pixel and needs no deadzone to paper over it.

Three things this arrangement has to get right. The arm is drawn but not grabbed:
it runs from the knob down to the pivot, so leaving it hit-testable put a
lever-shaped hole over the pivot and the point the box turns about could never be
picked up. The pivot sits above the lever, which sits above the resize handles,
because their targets overlap near the centre and the one you mean there is
always the pivot — the lever has its knob. And the lever is in the
`pointer: coarse` block: the old edge-mounted handle was left out of it entirely,
which is why rotation could not be worked on a phone at all — it kept the
fine-pointer 8px reach on a mark floating outside the box.

The pivot's page position is read from layout rather than from
`getBoundingClientRect`, which on a turned box reports the upright rectangle that
contains it. `offsetLeft` and friends are measured against `.trim`, which never
turns; the pivot is the transform origin, so it is the one point that does not
move when the rotation changes, which is what makes reading it that way valid.

Rotation is also exempt from the un-rotation `moveDrag` applies to every other
handle, because it reads where the pointer *is* rather than how far it has come.
The exemption is written as a list rather than a comparison precisely because a
new mode otherwise joins the wrong branch in silence.

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

**A clipping area draws the cut, not just a warning about it.** The bottom edge
— the one the words are actually severed on — takes a heavier dashed red line
over its bound, and the shears sit astride that line rather than above it, so
the mark reads as being *on* the cut it is making. Dashed because that is how a
cut line is drawn on anything meant to be cut, and in the same rhythm as the
bound it sits on so the two are one language. The other three edges are left
alone: only one of them is doing the cutting, and saying so on all four would
say nothing.

The badge is hollow — red on nothing, where every other mark here is a filled
chip. A solid red square at the corner was the heaviest thing on a card whose
whole subject is the artwork, and the line beside it is already carrying the
warning.

**A locked page takes the badges away.** Every badge on an area says why *that*
area will not do what you might ask of it, and on a locked page the answer is
the same for all of them — so the band over the sheet gives it once and the
column of per-area reasons is noise; two of them are buttons that would be
refused anyway. The overflow shears are not one of these and stay: they are
about what will print, which a lock does not change.

**The Locked band is the one indicator that is also its own control.** The rule
everywhere else is that a lock is set where the rest of that subject's settings
are, and the mark on the canvas only reports it. A locked page is the exception
because its settings bar is disabled behind the lock, leaving the band as the
nearest thing to hand; it wears the open padlock for a moment after the press,
and is kept on screen through that moment on purpose — the lock is gone by then,
so without it the band would vanish on the same frame and the answer would never
be seen.

**Two badges are controls, and they say so before you press them.** A badge is
the reason a box will not do what you asked; the anchor pair is also the way out
of that reason, in the same thirteen pixels. Each swaps to the icon of the
undoing while the pointer is on it — and for a moment after a tap, because a
touchscreen never hovers and would otherwise get no answer at all. Releasing an
anchor writes the box's *resolved* top back as its own `y`: "leave it where it
is" is the whole point, and releasing to a stale `y` would jump it up the card.

**Typing happens in a textarea laid over the content, not a `contenteditable`.**
A box holds text — Markdown source for a Markdown area — and a contenteditable
would hand back markup nobody asked for. It inherits face, size, color and
alignment from the box, so what you type is set the way it will print, and the
content stays in the DOM underneath (hidden) so the box keeps its measured height
and nothing anchored below it hops about mid-sentence. The card cannot write the
words itself: a bound area's text is a cell of the dataset and a static one's is
a field of the template, and only `+page.svelte` knows which it is holding.

**Image mode is image *or color*, and the color fills the box.** One mode
rather than two, because a column of brand colors and a column of logo URLs are
the same job and a template author should not have to know which the data holds.
A resolved color is emitted by `boxStyle` as the box's own `background`, so it
reaches under the padding and takes the corner radius; a tile is a background
too, because `<img>` cannot repeat. Everything else goes through `safeMediaUrl`,
which is the only door between an untrusted cell and an `<img src>`.

**Markdown links are inert in the editor.** A link on paper says where to go; it
does not go there. Live in the editor, clicking a word to pick up the area it
sits in navigated away from the app — and the app is the only place an unsaved
design exists. Screen-and-editor only: the print root and the lightbox render the
same DOM without `editing`, and paper has no pointer events to take away.

**The page number's separator is an element with no content.** `.page-number .of`
is empty and its glyph comes from CSS, precisely so a template's own stylesheet
can reach it — `content: ' of '`, or nothing. A literal `" / "` in the markup
would have been unaddressable.

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
are no rows. The page-lock band above the sheet is in that column for the same
reason, rather than hung off the sheet on a negative offset: on a phone the stage
has eight pixels of padding, and anything overhanging it is scrolled off the top
with no way to reach it.

**The stage is two elements: a frame that never scrolls and a viewport that
does.** Undo, the view toggles, the zoom and the pager were absolutely
positioned inside the scroller, so at any zoom past Fit they slid away with the
page — a tool you have to scroll back to find is a tool that is not to hand. The
frame holds every control; the viewport holds only the page. The pager's band is
real bottom padding on the viewport rather than a number taken off the fitted
scale, because the page is centred in what is left: subtracting it from the
scale alone centred the sheet across the band and parked half of it under the
count.

**An `<svg>` sized only by `inset` is 300 × 150.** The trim edge was positioned
with all four offsets and no width or height, which for a *replaced* element
means `width: auto` resolves to the intrinsic size and the opposite offset is
ignored — so it was drawn 300 × 150 at every zoom and only looked right by
accident near 100%. Every screen-only SVG on the card sets `width: 100%; height:
100%` for this reason; this one is given explicit pixels because it is inset
from a parent that is the bleed rectangle, not the trim.

**`fitScale` is a value, not a branch inside `scale`.** The zoom menu has to be
able to say "Fit — 43%" while the page sits at 200%; reading the current scale
there meant the Fit line renamed itself to whatever you had just zoomed to, and
so never once said what pressing it would do.

**The trim edge is drawn outside the card, above the grid.** The grid overlay is
a sibling of the scaled card, so nothing *inside* the card can paint over it —
and a trim edge hidden under a gridline is a trim edge you cannot follow. It is a
solid half-pixel SVG stroke, the same weight as the grid: a dashed whole-pixel
line was the loudest mark on a page that already has dashed bounds on every box.

**The nudge pad is drawn only when it could do something.** A locked area does
not move, and a pad whose every press is refused reads as a broken control
rather than as a locked area — the padlock on the area and the Locked band over
the page are what say why. An anchored area has no vertical freedom to give it
either: its top is read off another area's bottom, so the two vertical keys wear
the same link the area wears at its corner and are disabled, with the Gap field
in the bar as the way to change the millimetres between them. The trade-off is
that adjusting a gap on a touchscreen now means the bar; a pad key that silently
changed a number the pad does not show was the worse of the two.

**The nudge pad can be picked up.** It parks over the bottom-right corner of the
page, which on a phone is exactly the corner of the card you reached for it to
nudge. The second gesture goes on the middle button because the four arrows
already use press-and-hold to repeat, and the pad is clamped to the stage — a
control dragged off the edge of a phone is a control you do not get back.

**Controls sit next to what they act on.** Undo and redo are a column at the
page's top-left corner, with stacking order under them whenever anything is
selected and the multi-selection tools under that; *+ Area* is at the top-right,
the view toggles are along the bottom edge and the card pager sits under the
sheet. The window toolbar holds only what is about the whole app. Tools that come
and go with a selection belong on that rail rather than in the options bar, where
they would shove every other control sideways each time a second box was picked
up.

## `src/lib/components/DataTable.svelte`

**A sticky header's borders are not sticky.** Under `border-collapse: collapse`
the borders belong to the table's shared border grid rather than to each cell, so
`position: sticky` translated the header cell and left its rules behind — the
header stayed put and its lines slid away up the page. They are an inset
`box-shadow` now, which is painted with the cell's own box and travels with it.
The alternative, `border-collapse: separate`, would double every internal rule
and disturb the gutter sizing to fix one row.

**The table casts its shadow at the work.** Left on a wide screen where it sits
beside the page, up on a phone where it sits under it. It is on `aside` rather
than on the table's own root, because that is the grid item — and `aside` had to
be given `position: relative` to cast anything at all: `.stage` is positioned
with an opaque background, so a static sibling paints its shadow in the earlier
block-backgrounds layer and the stage covers it. The `border-left` it replaces
had no mobile override, so on a phone the table drew an edge down its left where
the seam was along its top.

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

**The row gutter is sticky in both axes.** The numbers are how you know which
card a cell belongs to, and they slid off the left edge the moment the table was
wide enough to scroll — which is exactly when they are needed. Being sticky
means carrying an opaque background, so the active and chosen tints have to be
repainted on the gutter itself rather than inherited from the row.

**A row number is where the row came from, not where it is sitting.** Sorting
really reorders the data, so numbering by position meant the labels stayed
1, 2, 3 and told you nothing; they are read out of the pre-sort order by
identity instead, so each number travels with its row and a sorted table still
says where everything came from. That lookup is by object identity, so every
edit that replaces a row object — `setCell` above all — has to swap the copy
held in that order too, and every structural edit keeps it in step. It falls
back to the position whenever a row cannot be found there, which is what makes
it safe against anything that forgets.

**Chosen and previewed are two different things**, and usually the same row. The
previewed row is the card on the page; the chosen set is what duplicate and
delete act on. Clicking anywhere on a row that is not the text does both, because
a row is a card and picking one is the commonest act in here — it used to be a
20px tick in the gutter. The tick now builds a set *without* moving the preview
off the card you are looking at, and the chosen marker is on the gutter alone so
a large selection does not repaint half the table.

**Sorting is three states on one control.** A-Z, Z-A, and back to the order the
rows arrived in. Unsorting used to be a separate button in the row-number gutter,
which is two controls for one question with the way out a long way from the way
in.

**A paste is a block of cells; a file is a table.** Insisting on a header row
meant copying cells out of a sheet and pasting them here quietly ate the first
one. A paste lands in the columns the table already has, matched left to right —
which is what a block copied out of those same columns is. Only when there are no
columns at all is the first line read as a header, because there is then nothing
else to name them with. `Import CSV` still parses a header, because a file is a
whole table.

**The table has nothing to say for itself.** Its notices go to the app's status
bar. A line of its own under the buttons meant there were two places a message
could appear and neither of them was where you were looking.

## Pull-to-refresh

**A reload is the one accident this app cannot absorb, so the browser is not
allowed to offer one.** Undo lives in memory: a phone reading a downward drag as
"reload the page" throws away everything since the last save that storage does
not carry, which is the same reason a waiting service-worker update sits there
asking rather than swapping itself in. It is worst in the lightbox, where
dragging the card *is* how you turn it, but the editor stage and the data table
are one flick from it too.

Three layers, because the platforms disagree about which one they honour:
`overscroll-behavior: none` on the document stops the chain reaching the
viewport; `contain` on every scroller inside it — the stage, the table, the
bars, the dialogs, the inline editor — stops a flick that runs out of content
becoming a page gesture at all; and the lightbox says `touch-action: none`,
because every touch on that screen is already ours and there is nothing on it to
scroll.

## `src/lib/components/SheetLightbox.svelte`

**A separate component, not `Lightbox` with a flag.** Everything that makes
the card lightbox what it is — the lean with the phone, the foil that moves
with it, a card dealt in from the side — reads as a printed card held in the
hand, and reads as nothing at all on an A3 imposition sheet. A sheet is a
proof: flat, as big as the window allows, arrows and a swipe to the next one.
Sharing one component would mean a `kind` prop threaded through the tilt, the
sensor grant, the deal transition and the foil, all switched off for one of
its two callers.

**A different ground, on purpose.** Near-black for a card, slate for a sheet.
The two are one tap apart inside the same modal, and a sheet of cards at
thumbnail scale is easy to mistake for a card at a glance — the backdrop is
what says which of the two you are looking at without reading the counter.
Still dark and still desaturated, because what sits on it is being judged for
print.

**No drag guard, because there is no drag.** `Lightbox` tracks pointer
movement so that turning the card and releasing over the ground does not also
put it away; here a swipe is the only gesture, and Chromium suppresses the
click after a touch that travels past tap-slop, so the backdrop's close and
the swipe cannot fire together. Driven and confirmed in a real browser rather
than assumed.

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

**Stepping the run deals one card out and the next one in.** Both halves are
on screen at once, moving the same way — the card you were looking at leaves by
one edge as its replacement arrives from the other — because a card that only
appears has come from nowhere, and what a step actually does is change which
card you are looking at. That needs two nodes alive at the same time, so the
card is keyed on the index (which is also what re-runs the animation: a node
that merely had its props changed never plays one a second time) and the pair
sit absolutely inside a `.card-stage` sized to one card, so they can overlap
without either laying the other out and without the arrows under them jumping
as they pass.

On the `translate` and `rotate` properties, not on `transform`: the tilt owns
`transform` and rewrites it every frame, so an animation there would be fighting
the gyroscope for the same property. The individual transform properties compose
with it — the used matrix is translate × rotate × transform — so the card
arrives already leaning whichever way the phone is held.

It is a hand-written Svelte transition rather than a CSS animation, because one
expression has to serve both directions: `u`, the eased distance from home, runs
1 → 0 arriving and 0 → 1 leaving, so neither card has to know which it is, and
the leaving card is handed the opposite side so the two move as a pair rather
than crossing. `travel` is 0 until the first step, which makes it a move from
nowhere to nowhere — opening the lightbox should not deal a card at you from a
side you did not choose — and a step clamped at either end of the run leaves it
alone, because nothing moved.

**A card arrives askew, but only where a gyroscope is reporting.** Seven degrees
off square, righting itself as it lands: a card thrown down on a table lands
crooked. That reads as physics on something already responding to how the device
is held, and as a glitch on a card that has been sitting perfectly square, so it
is gated on the same first reading the foil is. The one thing a Svelte
transition does *not* do for free is honour `prefers-reduced-motion` — the media
query the CSS animation this replaced sat inside — so the transition re-states
it itself and returns a duration of zero, which swaps the cards outright.

**Two things drive the tilt, and they add.** A gyroscope where there is one, and
a drag — the same gesture on a desk that turning the phone is in the hand, and
the only one available on a machine with no sensors in it. The settle loop runs
whether or not there is a sensor, which it did not before: it was started only
on the gyroscope path, so a mouse-and-keyboard machine had nothing easing
anything. The lightbox refuses text selection for the drag's sake — sweeping a
blue highlight across the card while turning it is not what the gesture is for,
and nothing in there is text you would copy. A drag that ends over the ground
either side of the card is a drag, not a click on the backdrop, so it does not
put the card away.

**The foil is gated on a gyroscope actually feeding us, not on one existing.**
It is the only thing on the card that is *about* the light in the room, and
without a real orientation to move against it is a painted-on smear rather than
a sheen — so it is switched on by the first reading, not by the capability
check. iOS hands readings out only after a grant that may never come, and a
highlight that cannot move is worse than none. The lean and the roll take no
such gate: a finger drives those too.

Three stops, and no blend mode. The core is white, which is invisible on white
paper — a specular highlight on a matt white card *is* nothing — and shows up
over dark artwork, which is where a real one would. The flanks are a breath of
blue on one side and amber on the other, and they are what you actually see on
the paper; they are the whole of what makes foil read as foil rather than as a
torch being shone at it. `overlay` and `soft-light` both resolve to nothing
against a white base, which is most of a card, so plain alpha compositing it is.

The band travels further than the card turns, because seven degrees' worth of
movement does not read as movement — but not so far that it leaves the paper,
because foil that goes blank when you tilt it is just a card again.

**The card rolls against the lean, not with it.** A card held loosely does not
turn with the hand: it hangs, and stays level in the world while the phone
rotates around it, which on screen is a counter-rotation — roll the phone
clockwise and the card appears to turn anticlockwise. Rolling *with* the tilt is
what a sticker stuck to the glass does, and that is what it looked like. The
roll rides on the same sideways reading as the lean and takes its sign from the
opposite, at a third of the angle: the type on the card is level, and past a
couple of degrees it stops reading as a card catching the light and starts
reading as a crooked print. The drag resists the same way, for the same reason —
push a card sideways and its mass lags behind.

## `src/lib/components/PrintSettingsPanel.svelte`

**Shared, not duplicated.** Print Settings is one component mounted from two
places — `PageOptions.svelte`, where every other page-level setting lives,
and `PrintPreview.svelte`, so a sheet size or count picked wrong does not
send you back to the editor before you can print. Both pass the same
`template`/`ontemplatechange` shape the rest of the page-setup bar uses; the
panel itself does not know or care which screen it is in.

**A `<select>`'s `value=` binding loses a selection that is not the first
option, on a fresh mount.** The browser applies `<select>.value` against
whatever `<option>` children already exist at that moment; Svelte renders
this component's `{#each}`-generated options as a child effect of the
`<select>`, and on a *fresh* mount (this component appearing for the first
time, template imported with imposition already on, or the print screen
opened first) the parent's `value=` assignment can run before that child
effect has inserted the options — the browser then finds nothing matching,
clears the selection to `-1`, and does not retry once the options do land, so
the picker silently shows "Off" or "Custom" no matter what the template
actually says. Marking the matching `<option selected>` does not fix it
either: once a `<select>` has had its `.value` set imperatively even once, a
later `selected` *attribute* only updates `defaultSelected`, not the live
selection. `bind:value` with a function binding looked like Svelte's own
answer to exactly this, but did not correct it in practice here either. What
does: `perSheetSelect`/`sheetPresetSelect` bound with `bind:this`, and a pair
of `$effect`s that set `.value` directly — an `$effect` runs after the DOM
for that render (children, including the each block, included) has already
committed, so there is no ordering race left to lose.

## `src/lib/components/PrintSheet.svelte`

**The block is centred with padding on the sheet, never a margin on the grid.**
A top margin on a first child collapses straight out of its parent: the block
landed at the *top* of the sheet and the sheet itself was pushed down by the
margin that escaped, so a thumbnail read as blank paper with a sliver of card
at the bottom — and the real print was off-centre in the same way, which the
first version of this shipped with. Padding cannot collapse. The sheet is
`box-sizing: border-box` so it still measures exactly the paper it names.

**The sheet's bleed is not the card's.** The card's says where to cut one card
out of the sheet; the sheet's says where to cut the sheet, so it outsets the
paper (and `@page` with it) and its marks go at the corners of the tiled
*block*. Those two cuts are made by different people at different times, and a
single setting would have to mean both.

**Sheet marks are drawn in whatever room there is.** Their length is the
smaller of the two paddings less the 1mm gap, capped at 6mm, and they are
skipped entirely when that comes out at zero — a block that fills its sheet
edge to edge has nowhere to put a mark, and drawing one over the artwork would
be worse than drawing none.

**One component, two contexts, the same pixels.** `PrintRoot.svelte` mounts
this off-screen for the actual print run; `PrintPreview.svelte` mounts the
identical component — same props, same DOM — inside a scaled thumbnail for
the Sheet Preview, and again as the element a PNG export of a sheet reads.
Nothing about layout, background or card scaling is duplicated or
approximated for the preview, so there is no way for the preview to promise
something the print or the export does not deliver. It was pulled out of
`PrintRoot.svelte`, which used to inline this per-sheet markup directly —
splitting it was what let the preview reuse it at all.

## `src/lib/components/PrintPreview.svelte`

**One door to the printer.** Print opens the preview; the preview prints. The
page selection lives there, keyed by row index and reset every time it opens —
sorting or deleting a row moves those indices, and a stale exclusion would drop a
different card than the one that was unticked.

**Sheet Preview groups the same rows Print and the PNG export will.** With
several cards to a sheet, `sheetGroups` chunks the *included* rows (excluded
ones already filtered out) into the identical `rows * cols` batches
`PrintRoot.svelte` uses — so reordering or excluding a row before printing
moves it between sheets in the preview exactly as it will on paper, rather
than the preview showing a grouping the print will not match.

**Print Settings sits between the two grids.** It is what turns the pages
above it into the sheets below it, so standing there it separates them and the
sheets need no heading of its own — which is why they no longer have one. It
runs edge to edge, like the toolbar it is: its own padding is the inset, and a
second one around it only made the strip look narrower than the grids it
divides. The checklist stays at the bottom: that one is about the browser's
print dialog, which is the last thing that happens.

**The title counts pages and sheets.** *Export — 4 pages / 2 sheets*, so how
many sheets a run comes to is answered before scrolling to them. It replaced a
button that jumped to the sheets: with the settings strip now between the two
grids, the sheets are one landmark away rather than a run's length away, and a
count in the title says more than a button that only moves you.

**A strip on a phone, a wrapping grid on a desktop.** Two thumbnails to a row
was fine for a dozen pages and hopeless for a hundred: everything else on the
screen — the sheets, the checklist — sat below the pages, so reaching it meant
scrolling past all of them. Narrow screens get one horizontally scrolling
strip per grid instead, each thumbnail two thirds of the width so the next one
peeks in and says the strip moves; the run then costs one screen however long
it is. A desktop keeps the wrapping grid, where the whole run is a few scrolls
whatever its length. The strip declares `touch-action: pan-x pan-y` and
`overscroll-behavior-x: contain` because it scrolls sideways inside a modal
that scrolls down, and a flick running off the end of it must not drag the
modal with it.

**PNG export reads whichever grid is on screen for the setting that is on.**
`exportPng` was one query (`.card` inside the per-card grid) before several
cards to a sheet existed; with it on, a PNG of an individual card is not what
was asked for — a PNG of the *sheet* is, so the export switches to reading
`.print-sheet` elements out of the Sheet Preview grid instead, named
`stem-sheet_N.png` rather than `stem_N.png` so the two exports are never
confused for each other in a directory listing.

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

**A fetch that is refused and a fetch that never answers are different
failures.** Both font fetches were wrapped in a try/catch that falls back to the
system stack, which covers the first and not the second: a captive portal or a
filtering proxy leaves the promise pending forever, and with it the whole export
— the button sits on "Exporting 1/4…" with no way out but a reload, which costs
the undo history. They carry an `AbortSignal.timeout` now, so the documented
behaviour (the family stays in the fallback stack and the export says which)
is what actually happens.

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
disabled by the lock it sets, and it says what pressing it will do — *Unlock* on
something locked — rather than naming its own state.

**Each bar opens with a two-line head**: what this is and what it is called, then
the buttons that act on it. They were at opposite ends of a bar that wraps to
four rows on a laptop, which meant acting on the thing you had just selected
began with finding the other end of the bar.

**Stacking order is not in the right-click menu.** It is the column beside the
page — it is about where an area sits on the sheet, and it wants to be pressed
four times in a row rather than reopened from a menu between each press.
Everything else the menu carries is a single act.

**Select Multiple is a mode, because a touchscreen has no shift key.** With it
on, every press on an area adds it to the selection or drops it, which is exactly
what a modifier-click does; `selectBox` treats the mode and the modifier as the
same thing, so there is one path and not two.

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
Deleting a row or a box happens straight away and says so, and so does Reset —
it replaces the template and leaves the data alone, and one snapshot carries
both, so Ctrl/Cmd+Z reaches it. (This paragraph used to say Reset asked twice
"because it clears browser storage and uploaded fonts". It does neither, and has
not for some time.) Two things do ask once, and neither is about undo: deleting
a *column* is a
field of every card at once and takes cells under a header you may not have
scrolled to, and deleting the whole table is not one row you can retype. Both
questions are a count rather than a paragraph — a warning nobody reads is not a
warning, and the second press the table used to ask for was only ever a way of
not reading the first.

**The style clipboard names its keys rather than subtracting.** `STYLE_KEYS` in
`boxops.ts` is written out in full: a copy defined as "everything except id, x, y
and w" would silently start carrying every field added to `Box` afterwards, and
one day pasting a style would move a box or rebind its column. Applying a style
writes every key including the ones the source lacked, because a paste is "make
this look like that" and a source with no border has to take the target's border
away.

**Areas are only rescued when they are wholly off the sheet.** `strayBoxes` asks
for *no overlap at all* with the paper, bleed included — not merely crossing the
trim. A box running off the edge is what bleed is for, and offering to drag every
deliberate full-bleed panel back inside the trim would be worse than saying
nothing. The button appears only when there is something genuinely unreachable.

## `src/lib/placeholders.ts`

**`{{date}}` is not a template language, and must not become one.** No
conditionals, no loops, no field references: a card that can compute is a card
whose output depends on something other than the row it was given. Anything
unrecognised is returned exactly as written, which is what stops a cell that
happens to contain braces being eaten. No time of day either — a card is printed
once and read for months, and a timestamp on paper is stale before the ink dries.

Substitution happens in `Card`'s `contentOf`, which is one chokepoint for every
mode; `rawContentOf` beside it is what the inline editor shows, because typing
over a substituted date would mean typing over yesterday's.

## `src/lib/gestures.ts`

**Reading a swipe is a pure function; feeding it events is an action.** A flick
has to beat both a minimum distance and a slope, because a drag at 45 degrees is
somebody scrolling and catching this on the way past — paging the cards out from
under them is worse than doing nothing. Touch only: a mouse has a wheel and two
arrows either side of the count, and treating a click-drag as a swipe would page
the cards every time somebody tried to select the counter's text.

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
