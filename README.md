# libelli

Turn spreadsheet rows into print-ready cards, entirely in the browser.

- **Project page** — https://heracl.es/libelli
- **Live instance** — https://libelli.vercel.app
- **Source** — https://github.com/Arty2/libelli

*Libelli* is the plural of *libellus*, a little book — about the size of the
thing coming out of your printer. The dragonfly in the mark is the same word
taking another turn: a *libellula* is one of those.

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
millimetres measured from the trim edge; [Markdown](#markdown-and-color) bodies
are rendered to HTML by a small hand-written renderer. The browser does the line
breaking, the wrapping and the [fonts](#fonts), then anchored boxes are placed
against the heights it produced. [Printing](#printing) re-renders the same card
component once per row, so the editor and the paper share one layout engine and
cannot drift apart.

Nothing leaves the browser, because there is nowhere for it to go. Small
settings — the column mapping, keyed by template name, and UI state — live in
`localStorage`; the dataset, the template and any uploaded font bytes live in
IndexedDB, which is where base64 fonts have to go once they blow past
localStorage's ~5MB. Pictures can live in a [folder of your
own](#where-the-pictures-live) instead, where the browser offers one.
[Undo](#undo-and-redo) keeps its snapshots in memory.

## Cards and boxes

A template is a list of boxes on a page. Page setup and box settings are two
separate bars: **Page Setup** in the toolbar shows or hides the template's own
settings, and a box's bar appears under it whenever a box is selected. Drag and
resize boxes directly, or type exact millimetres.

- **Millimetres, from the trim edge** — changing the page size or switching bleed
  on moves nothing, because no coordinate was ever expressed in pixels.
- **Content** — what an area holds, as one question with four answers.
  **Data Field** takes it from a column, so every card says something different;
  **Static Text** is words typed into the template, the same on every card;
  **Bitmap** is a drawing made here, and **Image** is a picture from an address
  or from this browser. The first two then take a **Mode** — plain text,
  Markdown, or a QR code, and a data field can also be **Bitmap**, **Image** or
  **Color**, since a column can hold any of the three. Words typed into the template cannot be a picture, so
  Static Text does not offer that mode: Bitmap and Image are that answer, said
  where the question is asked. Nothing about the file format changes — the four
  are the slot, the mode and which field holds the value, read back as one
  choice.
- **Slots** — a box renders the column its slot is bound to. The bar calls it the
  area's **Name**; *slot* is what the file format calls it. The mapping lives
  outside the template, so the same template works against another spreadsheet.
  A name is also the area's **CSS id**, which is how a template's own CSS reaches
  one named area: call an area *Job Title* and `#Job-Title { … }` styles it —
  spaces and punctuation become hyphens, a leading digit gets one in front of it,
  and the rest of the name is left exactly as typed. Because an id only means
  anything if one area answers to it, two areas may not share a name: a rename
  onto a name already in use is refused, the field goes back to what it said, and
  the status bar names the area that already has it.
- **`grow` / `clip`** — a grow box keeps its top edge and lengthens downward; a
  clip box keeps its height and hard-cuts what does not fit.
- **Anchors** — a box can take its top edge from the *rendered* bottom of another
  box, plus a gap. Drag an anchored box vertically and the gap changes rather
  than the link breaking. Both ends of the tie are marked and both marks are
  buttons: the **link** on the follower breaks its own tie, the **buoy** on the
  followed area casts off everything moored to it, and neither moves anything —
  the released box keeps the place it was sitting in. Selecting either end lights
  the *mark* on the other — the glyph only, never a fill, because those badges
  are on areas you have not selected and a filled badge reads as a second
  selection. The one fill is on the area you do have: what is moored to it, which
  is the hub of the relationship the other marks are pointing at. Each swaps to the icon of
  the undoing while the pointer is on it, and for a moment after a tap, so
  pressing one holds no surprise: the link shows a broken link, and the buoy
  shows a boat that has left it. A chain lights at two strengths: the mark on
  what follows the selected area directly, and the same mark at half strength on
  everything hanging off *that*, to the end of the chain. Moving the area you
  have picked moves all of them, so all of them are marked, and the end you are
  holding is the one that stands out. Upwards it stays one hop: what this area
  follows is a relationship it has, and what that one follows is not.
- **Hide when empty** — a box whose column is blank collapses to nothing *and*
  drops out of the anchor chain, so a card with no subtitle has no dead band
  where the subtitle would have been. A box with no anchor stays pinned to its
  own Y however long the body above it runs.
- **Alignment** — horizontal (left, centre, right, justified — justified text
  hyphenates) and vertical (top, middle, bottom) within the box's own frame.
- **Stacking** — areas paint in the order they are listed, so *Bring to Front*
  is a move to the end of that list rather than a z-index to keep in step.
  Several move as a block, keeping their order relative to each other. It is a
  column beside the page, under undo and redo — not in either bar and not in the
  right-click menu.
- **Several at once** — shift-click (or Ctrl/Cmd-click) to build a selection,
  Ctrl/Cmd+A for all of them; on a touchscreen, **Select Multiple** at the top of
  the right-click menu makes every press add or drop. A chip appears beside
  *+ Area* while it is on — a mode with no visible sign is a trap — and pressing
  that, or <kbd>Esc</kbd>, leaves it. Dragging any one moves the set; a column of icons
  appears beside the page, under undo and redo, to line them up against the box
  that encloses them all — left, centre, right, top, middle, bottom — and to
  lock, duplicate or delete the lot. **Group** makes
  a selection stick, so clicking any member picks up all of them; it is a shared
  name on each box rather than a container, which keeps the box list flat and
  leaves anchoring and stacking alone. Right-clicking inside a selection keeps
  the selection rather than collapsing it, and carries the six alignments as one
  icon row above its own items.

  One consequence worth stating: an anchored area takes its top from another,
  so lining it up vertically would be undone on the next render. Those areas sit
  the vertical alignments out and keep their anchor — the link badge beside the
  area says why, and the status line says how many stayed put. Horizontal
  alignment cannot fight an anchor, so they take part in that as usual.
- **Where a box gets its content** — one choice with two answers. A **Data
  Field** binds it to a spreadsheet column, so it changes card to card. **Static
  Text** is typed into the box and saved in the template, so it says the same on
  every card and travels with the design rather than with the data. An area with
  nothing typed into it is still an area — it keeps its fill, its border and its
  size, and **Hide When Empty** is what takes it away again. *+ Area* beside the
  page adds one, starting as static text. An area with **nothing to draw from**
  — because there are no rows at all, or because its name is bound to no column,
  or to one that has since been renamed or deleted — draws its own name in grey
  italics instead, and does not hide: a design whose areas have all collapsed to
  nothing is a design you cannot click on. An area bound to a column that does
  exist and is simply blank on this card still hides, because that is what it
  will do on paper. The placeholder is the editor's doing only: it never reaches
  paper, the lightbox or a PNG. An area carrying its own words wears a
  plug pulled out of its socket, because it is not plugged into the data.
- **Typing on the card** — double-click an area, or press <kbd>Enter</kbd> with
  one selected, and a text box lies over the content inheriting the face, size,
  color and alignment it will print in. A bound area writes through to the cell;
  a static one writes to the template. <kbd>Esc</kbd> or
  <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>Enter</kbd> leaves, and a plain
  <kbd>Enter</kbd> is a line break. Selecting an area also points the data table
  at the cells that fill it.
- **Placeholders** — `{{date}}` anywhere in an area or a cell prints today's
  date, and `{{date:YYYY-MM-DD}}` prints it in a format of your own: `YYYY`,
  `YY`, `MM`, `DD` for the numbers, `MMMM`, `MMM`, `dddd`, `ddd` for the names.
  Deliberately not a template language — no conditionals, no field references —
  and anything in braces it does not recognise is left exactly as written, so a
  cell that happens to contain them is not eaten. No time of day: a card is
  printed once and read for months.
- **The style clipboard** — **Copy Style** and **Paste Style** in the right-click
  menu, or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>c</kbd> and
  <kbd>v</kbd>, carry type, fill, border, padding, radius and fit from one area
  onto any number of others. A paste is "make this look like that", so it takes
  away what the source did not have rather than merging into what is there.
- **Rotation** — degrees clockwise, about a pivot you can move. Two marks on a
  selected area, because they do two different things: the **crosshair** is the
  pivot, and dragging it moves the point the area turns about; the **knob** on
  the short arm to its right is the lever, and swinging that turns the area. The
  arm runs rightward rather than downward because an area is usually wider than
  it is tall: pointing down, the knob sat over the bottom resize handles, and
  grabbing the bottom edge of a shallow area turned it instead. Holding
  <kbd>⇧</kbd> while you swing snaps to 15°. Both are drawn whether or not there
  is any rotation yet, because the lever is the rotation control and has to be
  there before there is a rotation to show; the **X** and **Y** in the bar place
  the pivot exactly, as a percentage of the area's own width and height. Press
  and *hold* either mark to put it back: the crosshair to the middle, the knob
  upright. Both are dragged to a value with no number written anywhere on the
  card, and both have a resting state most cards want — getting back to either
  by dragging is pixel-hunting, and the two fields in the bar are only there for
  a single selection. The hold gives up the moment the pointer moves, so the
  drag it shares a mark with is never mistaken for one. A
  turned area still occupies the space it would have upright, so anchored areas
  below it do not move — turning one thing never shuffles the card.
- **Overflow** — a box whose content is taller than the box will let it be draws
  the cut: a dashed red line along its bottom edge, where the words are actually
  severed, with a pair of shears astride that line at the right-hand end. A
  clipped card looks fine on screen right up until it is printed, and the line
  says where.
- **Past the edge** — the editor does not cut anything off at the card's edge:
  drag an area half off the page and it stays visible, with its handles where
  you can still reach them. What prints is another matter — the paper stops
  where the card does, and the print, the PNG and the contact sheet all clip
  there. So if an area is not wholly on the sheet — a corner of it hanging over
  the edge, or the whole of it dragged clean off, where zooming in or a small
  screen would leave it out of reach — a button appears under *Area* to bring it
  back on. It moves **only the areas that are off**: everything already on the
  paper is where somebody put it, and a rescue that rearranged the card to make
  room would be a worse problem than the one it solved. Each rescued area flashes
  as it lands, because a move you were not watching happen otherwise just leaves
  the card looking different. Running into the bleed does not count: that is what
  bleed is for. Neither does an anchored area's vertical position, which is the
  *Gap* in the bar and not something this button can write.
- **Surface** — a fill color, padding, a border and a corner radius, all in
  millimetres. A padding and a border each take one measurement all round, or
  one per edge behind the expander next to it; a border's style and the corner
  radius are always for the whole box. Four equal edges collapse back to a
  single number, so a template never grows structure it did not ask for. The
  border sits *inside* the box's millimetres rather than outside them, so framing
  a box does not move it or anything anchored below it — though padding and a
  border do make the box taller, which an anchored box below will follow, as it
  should.
- **Blend** — how an area meets what is under it: the paper, its own background
  image, and any area it overlaps. Thirteen of CSS's blend modes, the ones a
  printed page can show — **Multiply** is ink on paper and the one to reach for,
  **Difference** and **Exclusion** are the photocopier-zine ones, and *Normal*
  is what every area has always been. Blending stops at the card, so an area can
  never blend with the editor around it. Like the paper colour, it prints only
  with the browser's **Background graphics** on — and it survives the PNG export,
  which was checked rather than assumed.
- **Opacity** — how much of what is under an area shows through it, 0 to 100%.
  It fades the whole area at once — its fill, its border and its content
  together — so a wash of text over a picture is one setting rather than three
  colors with alpha in them. 100% is the absence of the setting, which is what
  every area has always been.
- **A border drawn by hand** — the pencil beside the border color draws it
  wobbling, as a line rather than a rule. Width, style and radius all still
  mean what they meant: a dashed 1mm hand border is dashed, 1mm and hand-drawn,
  and a dotted one is dots. Each edge is drawn with its own width, so an area
  with a bottom edge only comes out as an underline, and each corner is drawn
  by the edge arriving at it — which is what a pen does when the sides are
  drawn one after another. The wobble is worked out from the area's own name
  rather than from chance, so it is the same line on every card of the run and
  it does not redraw itself while you type; two areas are never drawn alike.
  It is an SVG over the room the CSS border was already holding, so switching
  it on moves no text and changes no measurement, and it prints and exports
  like anything else on the card.
- **Type without the bar** — <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> and the
  scroll wheel sizes whatever the pointer is over, in points, and the same
  modifiers with the arrows step the alignment of the selection in the direction
  pressed. Both give an area a value of its own on the first go, so an area that
  was inheriting stops.
- **Type defaults** — page setup holds the family, size, leading, spacing and
  color. A box that leaves those fields blank inherits them, so changing the
  page moves every box that never overrode it; a new box starts out inheriting
  everything.
- **Sheet size** — **A6**, **A5**, **A4**, **A3** and **Postcard**. A6 and a
  postcard are close enough to be worth keeping apart: A6 is the ISO size and
  the European postcard at 105 × 148mm, and *Postcard* here is the 4 × 6 inch
  one at 102 × 152. That two-millimetre gap is as close as this list can safely
  go — a preset is matched in either orientation, so a Postcard at 105 × 148
  would just be an A6 on its side and the menu would name it wrongly rather than
  offer both. A preset lands in the orientation you are already working in, and
  the swap button beside the height turns the page over — an A4 on its side is
  still called an A4. Neither moves anything on the card, because every
  coordinate is measured from the trim edge. Type your own numbers and it reads
  as *Custom*.
- **Page Bleed** — an outset on the page, never an offset on content: turning it
  on changes the sheet size, optionally with crop marks, and every box stays
  visually where it was. On screen the trim edge is a solid green hairline, the
  same weight as the grid and drawn above it, on the same toggle as the area
  bounds. The grid keeps its corner at the trim, not at the sheet, so turning
  bleed on does not slide the gridlines under the boxes they are there to
  measure. It sits in **Print Settings** with the rest of the print decisions,
  which means it is also to hand on the print screen. Crop marks lie on the
  trim lines and run outward into the bleed, each stopping a millimetre short
  of the corner: a mark that meets the artwork cannot be told from a rule the
  design meant to have, and that corner is what the guillotine lines up on.
  The amount is a distance and cannot go below zero. If what you want is a
  wider card rather than paper to cut off, a bleed gives you that too — the
  paper grows evenly on all four sides and nothing on the card moves, which is
  what changing the page size cannot do, since that adds to the right and the
  bottom only. Leave **Crop Marks** unticked and nothing says the band was ever
  meant to be cut.
- **Print Settings** — several cards printed to one physical sheet: **Pages per
  Sheet** is 2, 4, 6 or 8, onto A5, A4, A3 or a sheet of your own size in
  millimetres (the two millimetre fields appear for **Custom** — a named size
  already knows its numbers). Orientation is **Auto**, **Portrait** or
  **Landscape**, and Auto is the default: the sheet is turned to whichever way
  round holds the count with the least shrinking, worked out again every time the
  count, the card or the sheet changes, and the word beside the menu says which
  way it settled on. Eight A6 cards on A4 come out landscape without anybody
  noticing they had to. Naming a side pins it — the paper is already in the tray
  that way round — and the two millimetre fields are swapped to match, so they
  never disagree with the paper. Cards keep the millimetres they were designed at
  everywhere they are edited; imposition only decides how many trim-sized
  copies fit and tiles them edge to edge, centred on the sheet. Bleed does
  double duty here: the gap between neighbouring cards, and the crop marks
  between them, are the card's own bleed and **Crop Marks** setting, so there
  is nothing extra to keep in step. A count that does not fit the sheet at the
  card's own size, in any orientation, prints scaled down instead of
  refusing — every card on the sheet shrinks together, and the amount shows
  as *Scaled to n%* rather than leaving it a surprise. **Order** decides which
  page lands in which cell — see **Zines** below. The sheet can carry its
  own background image too — **Upload…** or **URL…**, **Cover**/**Contain**/
  **Tile** — separate from the card's own background and showing only in the
  margin around the tiled cards. This whole group is the one place both
  **Page Setup** and the print screen change the same settings: see
  **Print preview** below.
- **Sheet Bleed** and **Sheet Crop Marks** — the sheet's own, distinct from the
  card's, and set beside them: bleed outsets the paper around the sheet size,
  so a sheet whose background runs to its edge has something to trim into, and
  the marks go at the corners of the tiled block — the cut that takes the block
  off the sheet, which no card's own marks can show, since each of those stops
  at its own bleed. All four settings hold at once. The marks are drawn in the
  room the sheet already has — its bleed, and whatever the centred block is
  not using — so switching them on never moves a card; a block filling its
  sheet with no bleed to spare has nowhere to put them, and the sheet bleed is
  what makes that room. Which is why the tick only appears once **Sheet Bleed**
  is on, the way the card's **Crop Marks** appears under **Page Bleed**: without
  the room, it was a setting you could switch on and see nothing come of. The
  sheet's bleed cannot go below zero either, and with **Sheet Crop Marks**
  unticked it is simply a wider sheet with the cards where they were.
- **Background image** — *Upload…* takes a file from this machine, *URL…* takes
  an http(s) address, and either can **cover**, be **contained**, or **tile**.
  The image reaches the cut edge, bleed included, and sits on top of the paper
  color — so like the paper color, it prints only with background graphics on.
  **The picture is never part of the template.** An uploaded file's bytes stay in
  this browser and the template carries only its name; a linked one carries the
  address. Open a template on another machine and it asks for the file by name
  rather than rendering a blank page — the same bargain as an uploaded font.
- **Page numbers** — off by default; six corners to choose from, an adjustable
  margin, and the template's default type. The number is the row's position, so
  the editor, the print preview and the print all agree. **of Total** prints it
  as *3 / 12*; the slash is an element of its own, `.page-number .of`, so a
  template's CSS can set its content to anything or take it away. With **Left
  &amp; Right** on, four more positions appear: **Top**/**Bottom Outer** and
  **Inner**, which are the right edge on a right-hand page and the left edge on
  a left-hand one, or the other way about. Outer is where a page number goes in
  anything that is bound, because it is the corner a thumb turns the page by.
- **Left &amp; Right** — beside the page size, and off by default: a run of
  identical pages is what a deck of cards is. On, the run is a booklet — odd
  rows are right-hand pages, even rows the left-hand pages facing them — and
  three things follow. Areas **mirror** across the fold, keeping the distance
  from the *outer* trim edge they were given rather than from the left one, so
  a wide inner margin stays a wide inner margin on both sides of a spread; an
  area that should stay put says so with **Mirror** off in its own bar. An
  alignment you *chose* mirrors with it, so text pushed against one edge hugs
  the other edge on the facing page, while an alignment inherited from the page
  defaults is left alone — body text reads the same way on both sides of a
  spread. And **Outer**/**Inner** page numbers know which edge they are on.
  Mirroring is worked out as the page is drawn: the template stores one set of
  millimetres, measured on the right-hand page, so nothing is duplicated and
  turning the setting off puts everything back. Page through the rows and the
  editor shows each page on the side it will be printed on — including while
  dragging, which follows the pointer on a left-hand page and writes the mirror
  of it back.
- **Lock** — **Lock** in either bar freezes what you have: no dragging, no
  resizing, no option changes. A locked area can still be *selected*, or the
  button that unlocks it could never be reached. A page lock covers every box
  and the page settings as well. A padlock appears on a locked area, and it is a
  button: pressing it unlocks that area, the way the two anchor badges beside it
  undo what they say. A locked
  *page* says **Locked** in a band above the sheet and greys every bound on the
  card, because nothing on it can be moved and so nothing on it is worth
  coloring for a reason. It also takes the per-area badges away: every one of
  them says why *that* area will not do what you ask, and on a locked page the
  answer is the same for all of them and the band has already given it. The
  shears that warn of a clipped print stay, because a lock does not change what
  will come out.

  The band is the one indicator that is also the way out — the rest of the
  settings bar is disabled behind it, so a press unlocks the design and it
  answers with the open padlock for a moment before it goes. Elsewhere the
  button that sets a lock is in the bar with the rest of that subject's
  settings, and it says **Unlock** when that is what it will do. Turning bounds
  off takes all of it with it.
- **CSS** — page setup has a CSS button; what you write there is saved
  inside the template and travels with it. Selectors are scoped to the card, so
  nothing in a template can restyle the editor around it, and `@import` and any
  `url()` pointing off this machine are stripped — the app fetches nothing.
  Each area wears its own **Name** as an id, so `#Job-Title { … }` reaches that
  one area and nothing else; `.box` reaches all of them.

## Templates, and laying one out

**Several templates, one browser.** The **Template** field in page setup names the
loaded template; the caret beside it opens every template this browser has saved,
with **New template…** under a rule at the bottom. Renaming is typing in the
field — the template keeps its identity, so two of them may share a name without
sharing anything else. **Delete** sits next to **Reset** and takes the loaded
template only: Reset puts the starter card back under the same name, Delete
removes the template and opens the next one — or a new empty template, when it
was the last one, so the card a first run lands on can be deleted like any other.
Both ask first, and both are one Ctrl/Cmd+Z away — an undone delete is written
back out under the id it had.

The library lives in this browser and travels nowhere. **Export** is still how a
template leaves; an **Import** joins the library rather than replacing what is
loaded.

**Position areas automagically.** The button below *+ Area* — the one wearing
three shapes — reads your columns and writes a first draft of a card:
title, subtitle, body, a picture, a footer of small lines and a QR code, sized
and placed for the page you are on. It appears on an empty template, where it is
the answer to *now what?*; on a template that already has areas it is a **press
and hold** on *+ Area* instead, because a control that replaces a whole design
should not sit one mis-tap away from one you have built.

Either way it shows you what it thinks first: one line per column, the kind it
took the column for, and a sample cell to check it against. That list is nearly
the whole of the dialog — no paragraph explaining it, because the rows say it
better. Change anything it has read wrongly, or set a column to **Leave out**.
Columns it reached by length alone are marked *guess*. Where the template already
has areas, a line above the buttons says how many are about to be replaced.

- **What it reads** — the heading (a column called Price, Notes, Photo), and the
  shape of the cells (`https://` addresses, image file names, colors, numbers,
  dates, Markdown, how long the text runs). Facts about the cells beat the
  heading; the heading beats mere length.
- **What it never reads** — what a cell *says*. It measures and matches patterns;
  it does not write your cards.
- **What it produces** — ordinary areas. Nothing marks them as generated, and
  every one of them can be dragged, restyled or deleted like any other.
- **One undo** — the whole layout is a single history entry, so Ctrl/Cmd+Z puts
  the previous design straight back.

It works offline like everything else here: no service is consulted and no
library is loaded to do it.

## The data table

The dataset is one row per card, one column per field. It sits beside the page
on a wide screen and under it on a phone, and **Data** in the toolbar folds it
away when the page needs the room. Clicking anywhere on a row that is not the
text itself previews it and chooses it; the tick in the gutter chooses several
without moving the preview off the card you are looking at, and the tick in the
corner of the header chooses every row or drops every row — it shows a dash while
some but not all of them are chosen, which is what the next press will change.
Whatever the table has to say goes to the app's status bar, so there is one place
a notice can appear.

- **Paste** — a modal that takes a block of cells off a spreadsheet. Tabs, commas and
  semicolons are told apart by sniffing, and quoted fields with embedded
  newlines survive. **No header row needed**: the cells land in the columns you
  already have, matched left to right, which is what a block copied out of those
  same columns is. Only when the table has no columns at all is the first line
  read as a header, because there is then nothing else to name them with. Two
  buttons rather than a mode and a Load — **Replace Rows** and **Add Rows**.
- **Copy** — Paste's opposite number: the chosen rows onto the clipboard as
  tab-separated text, header included, ready to paste straight into a spreadsheet
  (tabs rather than commas, so it lands in cells instead of arriving as one long
  column). It sits with **Duplicate** and **Delete** in the group that appears
  when rows are chosen, because "these ones" means the same thing for all three;
  the tick in the header's corner is how you say *all of them*.
- **Import CSV** — the same parser against a whole file, header and all. Press
  and *hold* the button instead of clicking it, and the four sample cards come
  back: they walk through the app, and they are somewhere to start when a blank
  table is not. Your rows are replaced, the template is untouched, and
  Ctrl/Cmd+Z undoes it. A file holding no rows is **refused rather than
  applied** — picking the wrong one in a file picker should not cost you the
  table — though a file of headers and no rows will still set up the columns of
  a table that is already empty.
- **Add a column** — the `+` in the header. On an empty table it brings the first
  row with it: the `+` that adds rows lives under the row numbers, so until there
  is a column there is nowhere for it to be, and a column with no row under it is
  a table you cannot type in.
- **Rename in place** — type in a column header; the cells and any slot bound to
  that column follow the rename.
- **Reorder** — ‹ › in a header move a column left or right. Row objects are
  keyed by name, so this changes the view and nothing else.
- **Column widths** — drag the right edge of a header, or double-click that edge
  for the default. The widths are a view preference of this browser's, not part
  of the data or the template: they follow a column through a rename and go with
  it when it is deleted. The table lays out `fixed`, so a width you set is the
  width you get and one long cell cannot shove every other column sideways.
- **Cells fill their row** — a row is as tall as its tallest cell, and every
  field in it is that tall, so the target you click is the cell you can see.
- **Sort** — the arrow in a header is a three-way toggle: A-Z, Z-A, then back to
  the order the rows arrived in. Numbers sort by value rather than by digit,
  case is ignored, and blanks stay at the bottom either way. This reorders the
  data, not just the view, because row order *is* print order — and it is
  undoable. The **row numbers travel with their rows**, so a sorted table still
  says where each row came from. While any sort is on, the corner above those
  numbers wears the same mark an unsorted header wears, and pressing it puts the
  rows back — the third press on the header that did the sorting does the same
  thing, but only if you can still find that header, which in a table wide
  enough to scroll you may not be able to.
- **Add** — the pale row and column at the end of the table are placeholders:
  type into one and it becomes real. There is no separate button, because the
  place you would click is the place you were already typing.
- **Duplicate and delete** — choose one or more rows and the two icons appear at
  the head of the buttons under the table, before a rule. Immediate, with a line
  saying what went; undo covers it, and a confirmation you dismiss without
  reading protects nobody.
- **Deleting a column asks** — it is a field of every card at once, it takes
  cells under a header you may not have scrolled to, and any area bound to it
  goes blank on every card. Undo still covers it; the question is only so that a
  mis-aimed click on a 22px icon is not the whole of the decision. The red bin at
  the end of the toolbar empties the whole table and asks once, saying a count
  rather than a paragraph.

## Markdown and color

Body boxes render a deliberately small Markdown subset, written by hand so the
app carries no runtime dependencies and works offline. Everything outside the
subset renders as literal text, and every leaf text node is escaped.

Supported: `#`/`##`/`###` headings, `-` and `*` bullets with one level of
nesting, `1.` and `1)` ordered lists, `**bold**`, `*italic*`, `~~strikethrough~~`,
`` `code` ``, `[text](url)`, blank-line paragraphs, and `---`.

- **Ordered lists renumber** — from the source order, so a list that restarts
  part-way through still prints as one sequence.
- **Links are filtered** — `http`, `https`, `mailto`, `tel` and relative URLs
  only. A bare address is completed rather than refused: something shaped like an
  email address becomes a `mailto:`, and something shaped like a domain becomes
  an `https:`. Anything else stays as text. In the
  editor they are inert: a link on paper says where to go, it does not go there,
  and clicking a word to pick up the area it is in should not navigate away from
  a design that lives only in this tab.
- **Per-word color** — `[a few words]{red}` or `[…]{#b42318}` colors just that
  run. Hex, `rgb()`, `hsl()` and the CSS color keywords all work; seventeen
  common names — `red`, `green`, `blue` and their neighbours — are deliberately
  shadowed by a print-sensible palette, because CSS `red` is a screen color and
  comes off a press as a shout. Write the hex if you want that exact value.
- **Three levels of color** — a default text color for the card, a color for
  any single box, and the inline form above. A box's color beats the default;
  the inline form beats both.
- **Paper color** — set on the page. It prints only with the browser's
  background graphics switched on, which the app says out loud next to Print.

Colors from a template file, a settings field or a spreadsheet cell all go
through one parser that accepts hex, the named sets and `rgb()`/`hsl()` and
refuses everything else, so nothing can ride into a style attribute behind a
color. Nothing that comes back out of it is the string that went in: a
functional notation is rebuilt from the numbers it parsed to.

## Images, colors and QR codes

Three box modes carry something other than text, and the **Content** row picks
between them: Bitmap and Image where the template holds the value, or any of the
three as a **Mode** where a column supplies it. Both are framed by the box's
declared height, and both take a **Fit**: *fit* puts the whole thing inside the
box, *cover* fills the box and crops the overflow, *stretch* distorts it to the
box exactly, and *tile* — images only, since a tiled QR is not a QR — repeats it
at its own size.

- **Bitmap, Image and Color** — three modes, one for each thing a cell can hold.
  **Color** fills the area with what the cell says and refuses anything that is
  not a color, so an address in a column of colors is ignored rather than
  fetched; colors are read in hex, `rgb()`, `hsl()` or by name, and they fill the
  area itself, so the fill reaches under the padding and takes the corner radius
  with it. **Image** shows a picture — a data URL, an external URL, a name this
  browser is holding, or inline SVG held in the template — and still accepts a
  color, because it was the only mode for both and templates written then rely
  on it. **Bitmap** is a drawing made in the app and written into the cell as
  base64, so every row can carry its own and the picture travels with the table.

  Everything that can reach an `<img src>` from a cell goes through one guard
  that allows `http`, `https` and a base64 `data:` image and nothing else. A
  cell is untrusted; a template is a file someone can hand you. An address has
  to say what it is: a relative one like `paper.jpg` is refused rather than
  resolved against this app's own address, because the words in an ordinary
  cell are all relative addresses and every one of them would have been a
  request back to the app.
- **A picture from this machine** — drag an image file onto an area. The area
  turns into an image area, the bytes go into this browser, and the *name* goes
  into the table: the cell for that row reads `local:sketch.png`, so every row
  can carry its own picture and nothing about the design has to change. An area
  bound to no column has nowhere in the table to put it, so it keeps the
  reference itself and shows the same picture on every card.

  `local:` is a name, not an address — the bytes are in this browser, beside the
  fonts and the page backgrounds, and a cell that named a file any other way
  would either be fetched off the network or be a promise the browser cannot
  keep. **A page served over http cannot read a `file://` address at all**: the
  browser refuses, and no setting anywhere changes that, which is why dropping
  the file is the way in rather than typing a path.

  Nothing is uploaded and nothing is copied into the template, so a template or
  a CSV handed to someone else carries the *names*: their copy says which
  pictures it is missing, and dropping the files on again puts them back. An
  image uploaded as a page background can be used in a row without uploading it
  twice — they share one store, because an image is an image. Which store that is, and how to
  empty it, is **Images** in the toolbar — see below.
- **Drawing one** — double-click an image area, press the **pen** beside the
  page, or press **Draw…** in the area bar, and the drawing surface opens
  **full screen**. The pen appears under **Area** whenever the one area you have
  selected is one a drawing can go in, which is the same rule the bar follows. Never in place: an area on
  a card is often a centimetre across, which is somewhere to show a drawing and
  nowhere to make one. The board sits above its tools, and the tools are one
  row: a pen in the area's own colour, a **line** — press where it starts, let
  go where it ends — a rubber, three nib widths, undo, redo and clear, the size
  of the board, a **light or dark checkerboard**, **rotate** and **crop**,
  **copy** and
  **paste**, and then Cancel and Done — leaving is a drawing tool like the rest
  of them, and a row of its own under the board put the two most final buttons
  furthest from the hand that had been drawing.

  **Rotate** turns the drawing a quarter turn clockwise, board and all — the
  budget does not notice, because the same pixels are arranged the other way up.
  **Crop** takes the board down to what is actually drawn on it. **Copy** puts
  the board on the clipboard as a PNG and **paste** takes one off it, replacing
  the board and bringing its own size with it; both are on
  <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>C</kbd> and <kbd>V</kbd>, and a browser that
  refuses the clipboard says so in the header rather than failing quietly. All
  four are one undo away, board and all.

  Escape or **Cancel** leaves the cell as it was, and
  <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>Z</kbd> steps back inside the surface. The
  whole drawing is *one* entry in the app's own undo however many strokes it
  took.

  The board is **64 by 64 pixels' worth**, spent however you like: type a width
  and the height moves to pay for it, so 64 × 64, 128 × 32 and 512 × 8 are all
  the same board as far as the cell is concerned. What is fixed is the number of
  pixels, not the shape — that is the only thing a cell cares about, and it
  means a banner can be drawn on a banner without a square's worth of empty rows
  going into the table with it. The board does not follow the area's
  proportions: an area is millimetres on paper, a board is pixels in a cell, and
  tying them together made a drawing's cost change whenever someone resized the
  box it sat in.

  Resizing scales what is already drawn, and it is a step in the editor's own
  undo like any other — one <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>Z</kbd> puts the
  board *and* the detail back exactly as they were, so a board set too small
  costs nothing. A board is remembered on the area, and it is where the next
  drawing starts; a row that already holds a picture opens at that picture's own
  size, because what is in the cell is the thing being edited.

  It is drawn at whole screen pixels each — a pixel editor that blurs its own
  edges is no use — which is also why <kbd>Ctrl</kbd> and the wheel step the
  zoom through whole numbers rather than scaling smoothly. There is no
  two-finger pinch on the board: the fingers that would make one are the fingers
  drawing on it. A pinch is the page editor's, and stays that.

  What comes out is a base64 PNG written **into the row's cell**, which is the
  point: the picture travels with the table, so a CSV carries the drawings with
  the words and a row's picture is as portable as its text. That is also why the
  board is small — the header says what the drawing is costing the cell as you
  draw it, and a couple of hundred bytes is a long cell but a real one.

  An area set to **Repeat** tiles only the pixels that were painted: a tile
  repeats at its own size, so the transparent margin round a drawing would
  repeat as a gap in the pattern. The trimming happens as the card is drawn, not
  as the drawing is saved, so the cell always keeps the whole board — setting an
  area to repeat and back changes nothing in the table, and reopening the
  drawing gets the drawing rather than its trimmings.

  Unpainted pixels stay transparent, not white: the area's own fill and the
  paper show through, which is a thing you would otherwise discover on paper —
  and the checks behind the board are one to a pixel, so the pattern is also the
  grid. They come in light and dark, because the ink is the area's own colour
  and a drawing in white or a pale yellow is invisible on the light ones. A
  checkerboard is there to say "nothing here"; it cannot do that by hiding what
  is.
  And the area draws it *hard* — `image-rendering: pixelated` — so sixty-four
  pixels blown up to a centimetre or ten stay the pixels that were drawn rather
  than being smudged into a gradient by the browser. That applies to any picture
  an area holds as a data URL, which in practice means the ones drawn here; a
  photograph dropped on an area comes from a folder or this browser's store and
  keeps its smoothing.
  Opening the surface on an area that already holds a picture draws it in, so a
  dropped photo can be scribbled on — unless it came from an address off this
  machine, which a canvas refuses to hand back once drawn, and which therefore
  opens blank rather than opening on something it could never save.
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

## Where the pictures live

Everything else this app keeps is small — a template is a page of JSON, a
dataset is text. Pictures are not, and browser storage is a poor place for them:
it is a bucket you cannot look into, shared with everything else the app saves,
and the browser may empty it. **Images**, in the toolbar between Page
Setup and Data, is the panel that takes them seriously — beside the two bars
rather than inside one of them, because the pictures are the browser's and not
the page's.

- **What is stored** — every picture this app can see, what each weighs, where
  it is being kept, and whether the current table or template actually points at
  one. That last column is the whole point: *which of these forty can I delete*
  is not a question browser storage can answer. Deleting is one press, and it
  says so if something was using it.
- **A folder of your own** — press **Choose a folder…** and pictures are written
  there as ordinary files from then on: replace one from a photo editor and the
  card follows, back them up with the rest of your work, and clear them out with
  your file manager rather than through this app. The folder is remembered
  between visits, but a browser asks to be let into it once per visit — the
  panel says so, with the button to do it — and until then pictures come from
  browser storage as before. **Forget it** lets go of the folder; nothing in it
  is deleted.
- **Where that works** — the File System Access API is Chromium's: Chrome, Edge,
  Opera and Arc have it; Firefox and Safari do not. Everywhere else the app keeps
  pictures in IndexedDB exactly as it always did, and the panel says which of
  the two is in force rather than hiding a button that would not work.
- **Both at once** — a picture is looked for in the folder first and in this
  browser second, so a run made before you chose a folder keeps rendering, and
  a name put in the folder afterwards is what that name means from then on. New
  pictures only ever go to one place, and a name written to the folder drops its
  copy out of browser storage.

Drawings are the exception, and deliberately: they are base64 in the cell, so
they travel with the table. See **Drawing one**, above.

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
`@page { size: <w>mm <h>mm; margin: 0 }`, one physical sheet per row, no
trailing blank. With **Pages per Sheet** on, several rows tile onto each sheet
instead, in the grid **Print Settings** works out — scaled down together when
they do not fit the sheet at full size — and `@page` names the physical sheet
rather than the card's. Which row lands in which cell is **Order**: reading
order, or the order a fold needs. See **Zines** below.

## Zines

**Order**, beside **Print Per Sheet**, decides which page lands in which cell of
the sheet.

- **Sequential** is the card case and the default: the run is poured into the
  grid in reading order, sheet after sheet, to be cut apart.
- **Zinemaker** arranges the pages so that *folding* the printed paper gives a
  booklet that reads 1, 2, 3. Two folds are known, and they are the two people
  actually make:
  - **8-up** is the mini zine — eight pages on one side of one sheet, which is
    folded in half three times, slit along the middle fold between the two
    centre panels, and collapsed into a little book. Half the pages print upside
    down, because that half of the sheet ends up the other way up. Nothing is
    printed on the back.
  - **2-up** is a stapled booklet: two pages to a side, each sheet coming out as
    its front and then its back. Print double-sided, flipped on the long edge
    (if a proof comes out with the backs upside down, it is the other flip
    setting), fold the stack in half with each sheet inside the one before it,
    and staple the spine.

  Eight up is held to two rows of four and two up to one row of two whatever
  else would fit the sheet better — a fold has only one arrangement — so a page
  size that does not suit the paper shows as *Scaled to n%* rather than folding
  wrongly. The other counts, 4 and 6, have no fold here and keep the sequential
  order; the panel says so rather than pretending.

A zine is a multiple of four pages (of eight, for the mini zine) whether or not
that many were written, so a short run leaves **blank pages** where the fold has
none, in the places the fold puts them, rather than shifting everything after
them. Page 1 is the front cover and the last page the back — with **Left &amp;
Right** on as well, page 1 is a right-hand page and the spreads fall where the
fold puts them, which is what makes a cover a cover.

## Print preview

One screen holds both halves of getting a print right: every row rendered as a
small page, and the four dialog settings the browser gets wrong by default —
pick the **paper size** matching the physical sheet's millimetres (the card's,
or the imposed sheet's when **Pages per Sheet** is on), set **Margins** to *None*,
uncheck **Headers and footers**, and switch on **Background graphics**, which
Chrome drops along with the paper color. Checking the cards and reading the
checklist are the same act, so they are the same screen — and **Print
Settings** itself sits right there too: the same panel Page Setup shows, so a
sheet size or count picked wrong does not send you back to the editor to fix
it before you print.

With **Pages per Sheet** on, a second grid appears under the cards: **Sheets —
what will print**, one thumbnail per physical sheet, each showing exactly the
cards that land on it — the same component `PrintRoot.svelte` renders for the
real print, only scaled down, so the preview can never promise a layout the
output does not match. Excluding a card above regroups the sheets below it
immediately.

The tick under each thumbnail is as wide as the page above it and set like the
count in the header: on this screen it is the control that gets pressed over and
over, and a 15px box beside a small grey number was a pin to aim at.

**Export…** is the only way in, so there is no route to the printer that skips
the look at what you are about to spend paper on — <kbd>Ctrl</kbd>/<kbd>⌘</kbd>
<kbd>p</kbd> included, which is intercepted rather than left to open the
browser's own dialog on the editor. Press it again from that screen to send the
run. Choosing which pages go is at the left of that screen and **Print** and
**PNG** are at the right, because the two are not one row of three equal things.
From it: **Print**, or **PNG** — one 300 dpi file per selected page, or with
**Pages per Sheet** on, one per sheet instead, each carrying every card tiled
onto it — rendered here, with no library, by carrying the element into an SVG
`foreignObject` and drawing that to a canvas. Every face is embedded: uploaded
ones from this browser, and a Google family by fetching the stylesheet the
page already loaded and the font files it points at. That fetch is the one
exception to *the app fetches nothing*, and it is confined to the export,
because a PNG in the wrong typeface is not the card. A request that is
blocked or offline leaves that family in the fallback stack and the export
says which.

Every picture is embedded the same way, and for a sharper reason: an SVG
rasterised through an `<img>` — which is how this becomes a PNG — cannot load a
single external resource, and it fails *silently*. A card with an uploaded
background or a photo in an area used to export as a blank where the picture
was, with nothing to say so. They are read back and inlined as data before the
SVG is built, each address once per card however many areas share it.

**Print Settings** sits between the two grids, edge to edge: it is what turns
the pages above it into the sheets below it, so standing there it separates
them and needs no heading of its own. The print checklist stays at the bottom
— that one is about the browser's own dialog, which is the last thing to
happen. The title counts both units, *Export — 4 pages / 2 sheets*, so the
number of sheets is known before scrolling to them.

On a phone each grid is a strip you swipe along rather than rows you scroll
past. A hundred pages was a hundred rows between you and everything below
them; sideways, the run costs one screen however long it is, and each
thumbnail takes two thirds of the width so the next one peeks in and says the
strip moves. A desktop keeps the wrapping grid, where the whole run is a few
scrolls whatever its length.

Every page has a checkbox under it, and only the ticked ones print — untick the
three proofs that came out wrong and reprint just those — the whole caption row
under a thumbnail is the target, not the box in the middle of it. The count is
the control for the whole run — it sits at the left of the second header row,
opposite **PNG** and **Print** — and reads **4 pages**; pressing it clears them
to **0 pages** so you can choose, and pressing it again takes them all back. It is the same number that counts up as you tick, so what it says and
what it does are one thing.
A page keeps the number it has in the table however few of
them go, so page 4 prints as page 4 even when it is the only one selected. A PNG
run names its files `stem_01.png`, padded to the width of the run, so a directory
listing comes back in print order rather than as 1, 10, 2. The
selection is for one print: reopening the preview starts from every page again,
because sorting or deleting a row moves the positions it was pinned to.

Sheets have checkboxes of their own, and their own count beside the pages' one
— *4 pages / 2 sheets* — one sheet of a run misfed or came out streaked, and
reprinting it should not mean working out which four rows were on it. It is a second filter over the first: unticking a sheet drops that
sheet, and the pages on it stay ticked as pages. Changing which pages go
regroups the sheets, so it brings every sheet back — sheet 2 of a different
grouping is different paper, and a selection held over would drop the wrong
one. The title counts both, and both the print and a PNG-per-sheet run send
only the sheets still ticked.

Click a thumbnail to open that card full screen; so does the count under the
sheet in the editor — *3 / 12*, the number naming the card being the obvious
thing to press to see it properly. <kbd>←</kbd> / <kbd>→</kbd>, the arrows
either side of the count, and a swipe move between cards; <kbd>Esc</kbd> comes
back out; the card you were looking at leaves by one edge as the next one
arrives from the other, both in the direction you are travelling, and on a phone
the arriving card lands slightly askew and rights itself. Nothing is printed or
exported from there — it is only a proper look.
The card leans a few degrees as you drag across it, and turns a fraction of a
degree *against* the lean — the way a card held loosely hangs level while the
hand around it turns. Roll the phone clockwise and the card appears to turn
anticlockwise, because what moved was the frame and not the card; the other way
round is what a sticker on the glass does. On a phone the handset's own tilt
drives the same thing, and the two add, so a lean you introduce with your thumb
rides on the one the phone is already showing. Letting go springs it back to
level, because there is no gesture for putting it back. The roll is a third of
the lean, since the type on the card is level and anything more reads as a
crooked print rather than as a card. However you are holding it when it opens is
level, and a device asking for less motion gets none.

Where there is a gyroscope actually reporting, the card also picks up the
faintest foil: a band that sweeps across it as it turns, white at its core and
tinted blue and amber at its flanks. Deliberately at the edge of noticing — foil
that announces itself on a proofing tool is a distraction from the proof — and
absent on a machine with no sensor, since without a real orientation to move
against it would be a painted-on smear rather than a sheen.

A sheet thumbnail opens full screen too, and gets a screen of its own rather
than the card's: the sheet flat and as large as the window allows, the arrows,
a swipe and <kbd>Esc</kbd> doing what they do for cards, and none of the lean,
foil or dealing — those read as a card in the hand and as nothing at all on an
A3 sheet of them. The ground behind it is slate rather than near-black, so
which of the two you are in takes a glance rather than a read of the counter.

## Undo and redo

One undo entry is a snapshot of the whole editable state — template, data and
mapping — recorded on a short debounce, so a drag or a burst of typing is a
single step rather than forty. Snapshots rather than a command log: an inverse
operation cannot drift out of step with the operation it undoes, and this state
is small enough that the cost does not matter. The last 60 steps are kept.

Reset is covered by it too: it puts the template back to the starter card with
the design you had one undo away, and it does not touch the data, the mapping or
any font you uploaded.

<kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>z</kbd> is neither undo nor redo
but the pair on one key: it takes the last change off, and the next press puts it
straight back. That is the thing the fingers want while deciding — the page with
the change and the page without it, as many times as it takes — and neither
<kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>z</kbd> nor <kbd>Ctrl</kbd>/<kbd>⌘</kbd>
<kbd>y</kbd> does it, because both walk the stack a step further each press.
Anything else touching the history — a fresh edit, a plain undo, a redo — starts
the alternation over, since "the last change" is then a different change.

## Dialogs

Every dialog with an action opens with **nothing** pressed, and the focus on the
dialog itself. <kbd>Enter</kbd> moves onto the action it suggests, where it is
outlined and named; a second <kbd>Enter</kbd> presses it, and nothing intercepts
that second press — by then it is an ordinary Return on an ordinary button. The
point is a stray Return arriving a beat late after something else was dismissed:
it used to land on a focused button and delete a template or replace every row.
<kbd>Esc</kbd> still closes the dialog at any point, and a textarea inside one
still takes <kbd>Enter</kbd> as a newline.

The right-click menu carries no key hints. The two items that had them were the
only two that did, so the column of grey chords read as a property of those items
rather than as a key map; the key map lives here and in the help panel, once, for
all of them.

## One options row

The page bar and the area bar share a single row, and only one of them is ever in
it: selecting an area gives it the row, and **Page Setup** takes it back by
letting go of the area. They used to stack, which meant every selection added a
whole toolbar to the top of the window — the stage lost that much height, the
fitted scale changed with it, and the page jumped and resized under the pointer.

The row also never shrinks: it is floored at the tallest bar it has held at this
window size, so swapping one bar for the other does not move the page either. The
cost is a band of the bar's own colour under the shorter of the two; the floor is
dropped on a resize, because both bars wrap and neither height survives a change
of width.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>z</kbd> | Undo |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>y</kbd> | Redo |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>z</kbd> | The last change off, and on again — an A/B on one key |
| <kbd>Enter</kbd> | Type into the selected area, on the card |
| <kbd>Esc</kbd> | Stop typing, leave Select Multiple, deselect, or close what is open |
| <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> | Nudge the selection by 1mm |
| <kbd>⇧</kbd> + arrows | Nudge by 5mm |
| <kbd>Alt</kbd> <kbd>⇧</kbd> + arrows | Nudge by 10mm |
| arrows, <kbd>PageUp</kbd> / <kbd>PageDown</kbd> | Step through the cards, with nothing selected |
| <kbd>⇧</kbd> / <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + click | Add an area to the selection, or drop it |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>a</kbd> | Select every area |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>d</kbd> | Duplicate the selected areas |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Remove the selected areas |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>c</kbd> | Copy the selected area's words |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>v</kbd> | Paste plain text as a new area |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>c</kbd> | Copy the area's style |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>v</kbd> | Paste that style onto the selection |
| <kbd>?</kbd> or <kbd>/</kbd> | The help panel |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>;</kbd> or <kbd>h</kbd> | Bounds on or off |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>'</kbd> or <kbd>#</kbd> | Grid on or off (press and hold the Grid box for dots) |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>p</kbd> | Export — again from that screen to print |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>p</kbd> / <kbd>s</kbd> | Export, for the fingers that reach for those |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> + arrows | Step the alignment — left, right, top, bottom |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> + scroll | Size the type in the area under the pointer |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + scroll, pinch | Zoom the page |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>+</kbd> / <kbd>−</kbd> | Zoom the page in or out |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>0</kbd> | Fit the page (<kbd>⇧</kbd> for 100%) |
| <kbd>←</kbd> / <kbd>→</kbd> | Step through the cards, with one open full screen |

While a text field has focus, undo is left to the browser's own text history and
<kbd>Delete</kbd> deletes characters — the app keeps its hands off both.
Otherwise the arrow keys move the selected box wherever you are on the page. On
a touch screen the same job is done by the four-way pad that appears beside the
card — one cross with one outline, not five tiles in the shape of a cross — with
a chip in the middle cycling between 1mm, 5mm and 10mm; holding an arrow keeps
it moving. The cross is drawn as a raised thing — lit from the top left, thicker
along the bottom and right, casting one shadow of its own, and it goes down
under a press — because on a touch screen it is the one control with no cursor
to tell you it is a control. The middle is round and set in a shallow well: it
is not a direction, it is the step and the grip, and it should not read as a
fifth arm. The pad parks over the bottom-right corner of the page, which is
exactly the corner you may have reached for it to nudge — press and hold that
middle chip and the pad comes with your finger. It can be pushed off the edge of
the stage to get that corner back, as far as the middle chip: the arm you are
not using goes out of sight, the chip you pick it up by never does. It is not
drawn at all when nothing it could move is selected, and an area whose top comes
from an anchor shows the link on its two vertical keys rather than an arrow that
would do nothing: the millimetres between the two areas are the **Gap** in the
bar. Those two keys keep the pad's own face — a faded mark on them, not a faded
key, which would read as a hole in the cross — and they are not dead: they carry
the two ways out of the tie. **Hold one** and the selection walks up the tie, to
the area this one is following: that is where the Gap you actually want is, and
finding that area by eye on a full page is the hard part. **Tap one three times**
in a row and the tie itself goes, leaving the area exactly where it was sitting —
the resolved top is written back as its own, so nothing jumps. Three rather than
one, because these keys are also where a finger goes to nudge; after the first
tap the key wears the broken link, and the run lapses after a second and a half,
so the second and third taps are a decision rather than an accident.

### Touch gestures

- **Pinch to zoom the page**, anywhere over the stage. The gesture listens on
  the way down to whatever was touched, so it works over the areas and not only
  in the gaps between them — which is most of the page on a card that has been
  laid out. Type size is the **Size** field in the bar, or Ctrl/Cmd+Shift+scroll
  with a mouse: a pinch is how a phone zooms, and it means that here too.
- **A second finger is never a drag.** An area that was moving under one finger
  goes back where it started the moment a second one lands, so a pinch zooms and
  leaves the card alone.
- **Full screen, a pinch zooms the card** — up to six times, with a drag to move
  around it and a flick to page the run once it is back at rest. That is the one
  screen where zooming means what a phone means by it: the card is already as
  large as the window will take it, and the reason to pinch is to read the small
  print.
- **Buttons answer.** A press on any control gives a few milliseconds of
  vibration where the device has it, and a press-and-hold gives a firmer one as
  it fires — the only thing that says a gesture nobody can see is over. A hold
  that finds nothing to do stays quiet.

The arrow keys and the pad both move every area in the selection, not only a
lone one.

Dragging snaps in this order: switch **Grid** on and everything snaps to the 5mm
subgrid of a 10mm grid; otherwise a box latches onto the edges and centres of
its neighbours as it passes them, and a guide shows what it caught. There is no
key to hold for free movement — switch **Grid** and **Bounds** both off and
nothing latches, because a box should never snap to a guide you cannot see.

Press and *hold* the **Grid** box and the ruling becomes a **dot grid**: the same
millimetres and the same snapping, marked with a dot at each intersection instead
of a line through the card. The word beside the box says which it is drawing. Both
are placed as geometry rather than as a tiled background, so every line is where
its millimetre is at any zoom — a repeating gradient rounds its tile to whole
device pixels and drops whichever lines fall inside the rounding, which is why the
grid used to be missing lines at some scales and not others.

## Installing it, and working offline

libelli keeps a copy of itself in the browser, so it opens with the network off
and stays usable on a train or in a room with bad wifi. The first visit fetches
the app; every visit after that is served from that copy.

Where the browser offers it — Chrome, Edge and most Chromium browsers, on
desktop and Android — an **Install** button appears in the toolbar and puts
libelli in its own window, with its own icon, off the taskbar or app drawer.
The button is only there when the browser is actually offering an install, and
goes once you have taken it.

The copy is replaced a whole build at a time. When a new version has downloaded,
the status bar says *New version — keep undo history or update now to restart
this session* and offers **Update** rather than swapping it in underneath you:
undo history lives in memory, and a restart you did not ask for would throw it
away.

None of this changes what leaves the browser, because nothing does. The cache
holds this app's own files and nothing else — a font from Google or a background
image you pointed at a URL goes to the network exactly as it did before, and is
never stored.

Pull-to-refresh is switched off throughout. Undo lives in memory, so a reload
takes it with it — and in the lightbox, dragging the card downwards is how you
turn it, which is the same movement a phone reads as "reload the page".

**On iPhone and iPad**, Add to Home Screen deliberately keeps Safari's chrome.
A chromeless iOS web app has no Share → Print and no working print command, and
printing is the entire point of this app, so it keeps the browser's printer
instead of the full-screen look.

## Settings

Each bar opens with a two-line head — what this is and what it is called, then
the buttons that act on it — and runs in groups after that, outward from the
thing itself.

- **Page** — head: the template's name and the library behind its caret, then
  import, export, reset, delete, lock ·
  sheet size (a preset or your own, a button to turn it over, and left and
  right pages), bleed, crop marks · type defaults (font, size, leading,
  spacing, color) · surface (paper color, background image and fit) · page
  number, whether to print the total, and its margin · CSS
- **Area** — head: the field's name, then duplicate, delete, lock · content
  (data field or static text, column, mode, fit, QR settings) · type (font,
  size, weight, color) · setting (leading, spacing, case) · alignment,
  horizontal and vertical · surface (fill, padding, border width, style, hand and
  color, radius) · position (x, y, anchor, gap) · size (w, h, overflow, hide
  when empty, and mirror where the template has left and right pages) ·
  rotation and its pivot
- **Stacking order** — not in either bar and not in the right-click menu: a
  column beside the page, under undo and redo, whenever anything is selected.
  Bring to front, forward, backward, send to back. It lives there because it is
  about where an area sits on the sheet, and because it wants to be pressed four
  times in a row rather than reopened from a menu between each press.
- **Selection** — with more than one area chosen, another column appears under
  that one — the six alignments, then group, lock, duplicate, delete.
- **Right-click** — **Select Multiple** first, because it changes what every
  press after it means and a touchscreen has no shift key; then lock, then the
  style clipboard, then group, duplicate and delete. With several chosen it also
  carries the six alignments as one icon row.

- **Beside the page** — undo and redo at the top left, *+ Area* at the top
  right, with the button that lays every area out from the columns (on an empty
  template), the button that rescues stray areas, and the chip for Select
  Multiple appearing under it when any of them has something to say. Next to the
  thing they act on, rather than in the window's toolbar. None of it scrolls:
  the page moves inside the stage and every control stays where you left it,
  because a tool you have to scroll back to find is a tool that is not to hand.
- **The fields** — a value with a rule under it rather than a box around it.
  Thirty controls each in its own white well with its own frame is thirty
  rectangles competing with the card; labels are set small and uppercase, units
  stay lowercase beside the number, and buttons keep their frames because a
  button is a thing you press.
- **View** — in the bottom corners of the page itself, not the toolbar: grid and
  area bounds at the left (screen only, never printed), zoom at the right;
  between them, under the sheet, which card of how many you are looking at.
  **Fit** in the zoom menu says the percentage fitting *would* give you, not the
  one you are at. On a phone the two left-hand toggles keep their row and lose
  their words — a **#** for the grid and a **B** for the bounds, beside ticks
  that already say whether they are on — rather than stacking into a two-line
  panel that grew up over the sheet. What a screen reader is told does not
  change with the width.
- **The pager** — the two arrows and the count under the sheet are also a swipe
  surface: flick left or right anywhere across them, including over the count
  and over an arrow that has greyed out at the end of the run, and the card
  steps. Up and down still scroll.
- **The window toolbar** holds only what is about the whole app: the mark, then
  Help, Page Setup, Data and Export — the two panels in the order they sit on
  screen, settings above the page and the table beside it. On a phone the
  buttons drop their words and keep their icons, and the row is read from the
  outside in: Help and, where the browser offers it, Install on the left, the
  mark in the middle, the three that act on what is on screen at the right.

Every number says its unit: mm for geometry, bleed, spacing and gaps, pt for
type size, modules for a QR padding.

## Import and export

A template travels as JSON and carries no data with it — that is the point of
keeping the column mapping outside it.

- **Export** — in page setup: fonts referenced by family name, and a background image
  by file name or address. Small, diffable, git-friendly — no picture and no font
  bytes are ever folded into it. Its CSS, page numbers, locks, whether it has
  left and right pages and how its sheets are ordered all travel with it.
- **Import** — next to that export, so it cannot be mistaken for *Import CSV*
  under the table. Any font or background image the
  template names but this browser does not have is asked for by name rather than
  substituted. A linked background is only ever an http(s) address; a template
  cannot smuggle one in as `data:` or point the browser at anything else.

An imported template joins this browser's library under a new name of its own
rather than replacing the one that is loaded, so importing can never cost you the
template you were working on.

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
npm run gates    # the project's own rules, checked — see below
npm test         # vitest — the pure logic, unit by unit
npm run check    # svelte-check; kept at zero errors and zero warnings
npm run verify   # gates, units and types together — the one to run while working
npm run build    # static output in ./build, deployable anywhere
```

- **Sample data is bundled, not fetched** — `src/lib/sample-cards.csv` is imported
  with `?raw`, so a first run works offline and cannot land on an empty table
  because a request failed. It is a plain CSV precisely so the walkthrough can be
  edited in a spreadsheet rather than in a string literal. The four rows are a walkthrough of the app rather
  than filler; pressing and holding *Import CSV…* brings them back at any time.
- **Reset** — puts the template back to the starter card and leaves the data,
  the mapping and any uploaded fonts alone. Undo reaches it — one snapshot
  carries the template and the data together — but it asks first anyway, because
  it is the whole design going at once and the table's own Delete asks for less.
- **Components are verified by driving them** — the pure logic has unit tests;
  layout, printing and the dialogs are checked in a real browser, where the
  geometry can be read back in millimetres and the PDF counted page by page.
- **Gates** — `scripts/gates.sh` runs first in CI and fails the build on the
  rules a linter cannot see: no `innerHTML` or `eval` anywhere in `src/`,
  `{@html}` only in the three renderers that have earned it, `fetch` only in
  `png.ts` and the service worker, no runtime dependencies, `color` never
  spelled with a `u` where it names something, `VERSION` in step with
  `package.json`, and `AGENTS.md` inside its line budget. A rule that only lives
  in prose is broken by the first change that does not re-read it, so the ones
  that can execute do. Add the next one there rather than as a paragraph.
- **Version** — `src/lib/version.ts` is the source of truth, kept in step with
  `package.json` (and the gate above fails the build if they drift apart). A fix is a patch (0.1.0 → 0.1.1), a feature is a minor
  (0.1.1 → 0.2.0), and the leading zero never moves.
- **Deploying** — `npm run build` writes a static site to `build/`; any static
  host serves it. `vercel.json` states the build command and output directory
  outright and turns the framework preset off, because Vercel reads this as a
  plain Vite app and goes looking for `dist/`. Not the SvelteKit preset: that
  expects the Vercel adapter's `.vercel/output`, which would mean serverless
  functions this app has no use for.

`AGENTS.md` covers the load-bearing decisions and how the code is meant to be
worked on — `CLAUDE.md` is a one-line import of it, so any agent reads the same
rules. `docs/decisions.md` holds the why behind each module, and `PLAN.md` is
the plan it was built from.

## Credit

[Dialectic Acheiropoieton](https://heracl.es/libelli) of Heracles Papatheodorou
and&nbsp;Claude

MIT License.
