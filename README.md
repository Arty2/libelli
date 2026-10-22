# libelli

**libelli** is a free, open-source web app that turns the rows of a
spreadsheet into print-ready cards. It runs entirely in the browser: there is
no server and no account, nothing is uploaded, and it keeps working offline.

- **Project page** — https://heracl.es/libelli
- **Live instance** — https://libelli.vercel.app
- **Source** — https://github.com/Arty2/libelli

## Name

*Libelli* is Latin, the plural of *libellus*: "little book", a diminutive of
*liber*, "book". The dragonfly in the logo is a nod to *Libellula*, a genus of
dragonflies whose name is thought to come from the same word.

## Overview

A user pastes or imports a table, designs one card, and links each area on
the card to a column. libelli then produces one card per row. Typical uses are
labels, recipe cards, exhibition captions, revision cards, programmes and small
booklets.

The card is laid out on a page measured in millimetres. An area can take its
words from a column, hold fixed text, or show an image, a drawing or a barcode.
Areas can follow one another down the page, grow or shrink to fit their
content, and disappear when their column is empty, so a card without a subtitle
has no gap where the subtitle would be. **Layout** can also read the columns and
propose a first draft of the card. The editor and the printed page share one
layout, so what is on screen is what is printed.

Every control in the app has a tooltip: hover over it, or press and hold it on
a touchscreen. This page covers what a tooltip cannot.

Open libelli in a second tab and it asks what to do, because only one tab
edits at a time: **Open Here** moves the editing to this tab, **Read Only**
shows the card being edited in the other tab, updating as it changes and
following the row it is on, and **Close** closes this tab. A read-only tab
saves nothing; the eye beside the card brings the choice back. Put a
read-only tab in full screen and it shows the card alone, fitted to the
screen, as a display; leaving full screen brings the rest back.

## Data

A table can be pasted straight from Excel, Google Sheets, Coda or any other
spreadsheet, or imported as a CSV or TSV file. Quoted fields and line breaks
inside a cell are kept. When pasting into a table that already has columns, no
header row is needed: the cells fill the existing columns from left to right.

A row whose card runs off the page is marked with a warning sign under its
number. That is a Grow area whose words grow it past the page margin or the
edge, or an area anchored under one that it pushes there; an area placed in the
margin on purpose is marked only once it grows past the edge. Hover or hold the
sign to see which areas.

Cell content is always treated as text. A cell containing `<b>x</b>` prints
those characters, not bold type.

Column names contain no spaces: spaces become hyphens, and other punctuation is
removed. This keeps every name usable as a placeholder (below).

Several tables and templates can be kept side by side, and they are
independent of each other: one design can print any table, and one table can be
printed with any design. A table exports as CSV; a template as JSON.

A CSV, TSV or template JSON can be dragged onto the app from your files, and
the table menu's Import opens a CSV or TSV the same way. Each opens as a new
table or a new template, and the ones you had open are saved first, so nothing
is overwritten; Ctrl/Cmd+Z goes back to them. A file already in your library,
unchanged, opens that copy rather than making a second one. To fill the open
table instead, use Paste. A file that is
not one of those, or that does not read, is named in the status bar with the
reason. A picture is dropped on the page or on an area instead.

## Placeholders

Text between double percent signs is replaced on each card. Placeholders work in
an area's own text and inside cells, and Markdown around them still applies.

| Placeholder | Prints |
| --- | --- |
| `%%title%%` | The `title` column of this card's row. Case is ignored. |
| `%%title:find:replace%%` | The column, with every `find` replaced. The replacement may be empty; a literal colon is written `\:`. |
| `%%today%%` | Today's date. `%%today:YYYY-MM-DD%%` sets the format, with `YYYY`, `YY`, `MM`, `DD`, `MMMM`, `MMM`, `dddd` and `ddd`. |
| `%%today:countdown:2026-12-25%%` | The time to a moment: "4 days", then "5 hours", then "40 minutes", rounded down; once it has passed, "3 days ago". The moment is `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` in this browser's time, or a column holding one, for a deadline per row. A unit on the end fixes it: `%%today:countdown:2026-12-25:hours%%`. On screen it moves on by itself. Its words come from CSS, so a template can translate them — see Language. |
| `%%lookup:3:price%%` | The `price` column of row 3. Row numbers follow their rows when the table is sorted or rearranged. |
| `%%lookup:next:title%%` | The same column in the next row; `previous` for the one before. |
| `%%page:current%%`, `%%page:total%%` | The card's page number, and how many pages there are. |
| `%%toc:title%%` | A table of contents: each other page's `title` with its page number. |
| `%%%` | A tab: what follows is pushed to the right edge, as in `Espresso %%% 2.20`. The area's **Leader** fills the gap with dots, dashes or a line. |

A placeholder that matches nothing is underlined in wavy red in the editor.
Typing `%%` in any text field offers the column names. A single `%` is ordinary
text. `today`, `lookup`, `page` and `toc` are reserved words; a column with one
of those names has to be renamed, or reached with `lookup`.

## Markdown

Areas set to Markdown support a small subset: `#`, `##` and `###` headings,
bulleted lists (one level of nesting), numbered lists, `**bold**`, `*italic*`,
`~~strikethrough~~`, `==highlight==`, `` `code` ``, `[links](https://…)`,
paragraphs separated by a blank line, and `---` for a rule. Anything else is
shown as written.

`[some words]{red}` colours just those words. Hex values, `rgb()`, `hsl()` and
the standard CSS colour names are accepted.

## Template CSS

Each template can carry its own stylesheet. Its rules apply only inside the
card, and `@import` and external `url()` references are removed.

- An area is reachable by its name: an area called *Job Title* is `#Job-Title`.
  `.area` matches every area.
- Areas also carry classes for their content (`.content-field`,
  `.content-static`, `.content-image`) and mode (`.mode-plain`,
  `.mode-markdown`, `.mode-image`, `.mode-color`, `.mode-qr`), and `.columns`
  when set in
  columns.
- Pages are reachable as `#page-3`, `#cover`, `#back-cover`,
  `#inside-cover` and `#inside-back-cover`, and as `.recto` and `.verso` when
  facing pages are on: `#cover .area { … }`.
- The page settings are available as variables: `--page-w`, `--page-h`,
  `--margin-top` (and the other three edges), `--bleed`, `--text-font`,
  `--text-size`, `--text-leading` and `--text-color`.

**Starter**, in the CSS editor, writes out a sheet describing the current
template — its page, fonts and every named area — which can be edited directly
or handed to an AI model to style.

## Printing

**Export** opens a preview of every card before anything is printed; untick a
card to leave it out. From there the run can be printed, or saved as 300 dpi PNG
files, bundled into one ZIP when there are several.

For the print to match the screen, set these in the browser's print dialog:

1. **Paper size** — the size of the card, or of the sheet when several cards
   share one.
2. **Margins** — None.
3. **Headers and footers** — off.
4. **Background graphics** — on, or the paper colour and background images are
   dropped.

**Print Settings** can place 2, 4, 6 or 8 cards on one sheet, with bleed and
crop marks. Its **Order** setting can also arrange the pages for folding:

- **2-up (folio)** — a stapled booklet. Print double-sided, flipping on the
  long edge (if the backs come out upside down, use the other flip setting),
  fold the stack in half and staple the spine.
- **8-up (octavo)** — the one-sheet mini zine. Print one side, fold in half
  three times, cut the centre of the middle fold, and fold into a booklet.

A booklet is padded with blank pages to a multiple of four (eight for the mini
zine). With **Recto / Verso** on, left-hand pages mirror the layout of the
right-hand ones across the fold.

## Language

**Language** in the Page bar says what language the cards are in. It sets the
page's `lang`, which picks the dictionary justified text hyphenates with, and
which the template's CSS can test with `:lang()`. Words the app adds itself
come from CSS for this reason, in English unless the template says otherwise:
the page number's separator, and a countdown's units and "ago".

```css
:lang(el) .countdown-unit.days::before { content: ' ημέρες'; }
:lang(el) .countdown-unit.day::before { content: ' ημέρα'; }
:lang(el) .countdown.past::after { content: ''; }
:lang(el) .countdown.past::before { content: 'πριν από '; }
:lang(el) .page-number .of::before { content: ' από '; }
```

The units are `.minute`, `.minutes`, `.hour`, `.hours`, `.day` and `.days`, one
for a count of one and the other for every other count; a language with more
plural forms than that gets the two.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>z</kbd> | Undo |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>y</kbd> | Redo |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>z</kbd> | Toggle the last change off and on, to compare |
| <kbd>Enter</kbd> | Type into the selected area |
| <kbd>Esc</kbd> | Stop typing, leave Select Multiple, deselect, or close what is open |
| Arrows | Nudge the selection 1 mm; with <kbd>⇧</kbd> 5 mm, with <kbd>Alt</kbd> <kbd>⇧</kbd> 10 mm |
| Arrows, <kbd>PageUp</kbd> / <kbd>PageDown</kbd> | Move between cards, with nothing selected |
| <kbd>⇧</kbd> / <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + click | Add an area to the selection, or remove it |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>a</kbd> | Select every area |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>d</kbd> | Duplicate the selected areas |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>l</kbd> | Lock or unlock the selected areas |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>l</kbd> | Lock or unlock the design |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the selected areas |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>c</kbd> / <kbd>v</kbd> | Copy an area's words; paste text as a new area |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>c</kbd> / <kbd>v</kbd> | Copy an area's style; paste it onto the selection |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> + arrows | Change the alignment |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> + scroll | Change the type size of the area under the pointer |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + scroll, or pinch | Zoom the page; off the page, the interface's text size |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>+</kbd> / <kbd>−</kbd> | With areas selected, make their type a point larger or smaller |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>+</kbd> / <kbd>−</kbd> / <kbd>0</kbd> | With nothing selected, zoom the page in, out, or fit (<kbd>⇧</kbd> <kbd>0</kbd> for 100%) |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>h</kbd> | Show or hide area outlines |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>;</kbd> or <kbd>\|</kbd> | Cycle the guides |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>'</kbd> or <kbd>#</kbd> | Show or hide the grid |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>s</kbd> | Save the drawing, while drawing |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>p</kbd> | Export; press again to print |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>p</kbd> or <kbd>s</kbd> | Export |
| <kbd>?</kbd> or <kbd>/</kbd> | Help |

Holding **Undo** or **Redo** beside the page, or right-clicking either, lists
every step it could take, so several can be skipped at once.

While typing in a field, undo and <kbd>Delete</kbd> act on the text, as usual.
On a touchscreen, a pinch on the page zooms it; **zoom and pan** (under
*+ Area*) lets one finger scroll the page and adds an on-screen pad for
nudging; and a long press on an area opens its menu.

## Storage and offline use

Everything is saved automatically in the browser. Images and fonts are stored
by name, so a template stays small and can be shared as a JSON file; whoever
opens it is asked for any image or font they do not have. Drawings made in the
app are the exception: they are saved inside the table cell, so they travel
with the data. In Chromium-based browsers, images can be kept in a folder on
disk instead.

Undo history is kept in memory, so it lasts until the page is reloaded; an
update waits for the user to accept it for the same reason.

The app keeps a copy of itself and works offline after the first visit. Where
the browser supports it, it can be installed as an app. Only one tab edits at a
time; a second tab offers to take over.

## What leaves this machine

Nothing that is typed, drawn or imported is ever uploaded. There is no backend
and no analytics. Three kinds of request do reach the network, each because
something was asked for by name:

- **Google Fonts.** Choosing a Google font, or opening a template that uses
  one, loads it from `fonts.googleapis.com`. A template from someone else can
  therefore trigger this request when opened. Only a valid font name is
  accepted. Uploading a font file avoids the request entirely.
- **A linked background image**, when a template names one. Only `http` and
  `https` addresses are allowed.
- **The app's own files**, cached so it can work offline.

A template's CSS cannot add to this list, and neither can a cell: a stored
image is written `local:name`, which a browser never treats as an address.

## Development

libelli is a static SvelteKit site with no runtime dependencies; the Markdown
renderer, the CSV parser and the barcode encoders are written by hand.

```bash
npm install
npm run dev      # http://localhost:5173
npm run verify   # project rules, lint, unit tests and type checks
npm run build    # static output in ./build, for any static host
```

Versions are numbered `0.minor.patch`, and the leading zero never changes:

| Change | Bumps | Example |
| --- | --- | --- |
| A fix | the patch | 0.29.6 → 0.29.7 |
| A feature | the minor | 0.29.6 → 0.30.0 |

[`AGENTS.md`](AGENTS.md) explains the codebase and its rules,
[`docs/decisions.md`](docs/decisions.md) the reasoning behind each module, and
[`CHANGELOG.md`](CHANGELOG.md) what each version added.

## Credit

[Dialectic Acheiropoieton](https://heracl.es/libelli) of Heracles Papatheodorou
and&nbsp;Claude

Released under the [MIT License](LICENSE).
