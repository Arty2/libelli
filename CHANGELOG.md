# Changelog

What changed for someone using libelli, newest first. One section per minor
version, headed by the last version it shipped as: a patch rewrites its minor's
heading to the new number and adds its lines there, never a section of its own.
The app shows this file under **What's new** — press the version number in the
status bar.

## 0.24.6 — 2026-09-30

- What's new: press the version number in the status bar for this list. A dot
  on it after an update means there is something you have not read yet.
- Keys no longer reach the card behind an open dialog: Delete, Ctrl/Cmd + D or
  Enter with the help panel up used to change areas you could not see.
- An area's badges keep the same size, icon and rounded corners at any zoom,
  like the corner handles, instead of growing and shrinking with the page.
- Zooming with a selected area holds it where you zoom — under the pointer,
  or between your fingers — rather than about its middle, and still keeps the
  area in view when you zoom from beside it.
- The grid is sharp: every line is one screen pixel, and the dot grid is
  small, even, dark grey dots (light on a dark card) rather than a faint blur.
- Zoomed in, there is room to scroll past every edge of the page, so no
  corner of it has to sit under the toolbars.

## 0.23.0 — 2026-09-29

- Placeholders are written `%%name%%` instead of `{{name}}`, so text written
  for Hugo, Jinja or Mustache can share a card. The old form is not read any
  more: retype a `{{name}}` as `%%name%%`.
- Spaces around a placeholder's name, and inside it, are allowed again.

## 0.22.0 — 2026-09-29

- `%%lookup:ROW:COLUMN%%` reads a cell from another row, counted in the rows'
  own numbers, and follows its row through deletes and moves.
- `%%today%%` for the date.
- Getting Started mentions both, and its second card fits its page again.

## 0.21.1 — 2026-09-29

- Page Setup and the area bar are one bar of named groups with plainer labels.
- An area's text, fill and border color can come from a column of the row.
- Recto / Verso, list leading and three new list markers in the area bar.
- Swap templates from Page Setup.
- The starter booklet prints in printer's red, its title following an accent
  column.

## 0.20.1 — 2026-09-28

- No browser zoom: a pinch or Ctrl/Cmd + scroll off the page sizes the
  interface's text instead, and icons grow with it. Pressing the logo puts the
  size back.
- A stray label no longer widens the page on a phone.
- Without JavaScript the page says so, and why.

## 0.19.5 — 2026-09-27

- A5 Starter Booklet: a designed starter template that prints as a zine, and a
  way back to it as it came.
- A Stamp border style, and `find:replace` inside a placeholder.
- Zoom about the selected area; double-tap the zoom for Fit and back.
- A pan button with the nudge pad inside it; hold its middle to make areas
  ignore a press.
- Ctrl/Cmd + L locks the selection, Ctrl/Cmd + Shift + L the design.
- A new area waits for its first key and flashes as it arrives.
- Color names mean what they mean in HTML.

## 0.18.23 — 2026-09-26

- Drawing happens in the full-size editor: a pencil, a nib, rectangle and
  ellipse, flips, a true crop and a color picker.
- Every drawing is listed in the Images tray, with download buttons.
- `==highlight==` in Markdown.
- Every blue in the app comes from one accent, the system's where it is known.
- A tooltip for every control; press and hold on a touchscreen.
- Automagic layout reads headings word by word, knows an image column by its
  cells, and places detail and credit lines.
- Guides go round three states, and Boxes gets a third that draws every tie.
- A first visit opens the starter card locked.

## 0.17.0 — 2026-09-26

- A tour that shows rather than tells, on a starter card with some style.
- Import & Export moves to the first card.

## 0.16.33 — 2026-09-25

- Placeholders inside an area's words, and a lockable table.
- Page margins: a setting, a guide beside the grid, and something to snap to.
- Images as a tray, with uploads that carry onto areas.
- A table menu with Import and Export; drag rows by their number.
- Every PNG in one ZIP.
- Color with alpha; a QR's quiet zone is the area's padding.
- The drawing editor opens as a dialog.

## 0.15.0 — 2026-09-22

- More than one table in the browser.
- Delete joins the area's menu, with its own glyph.

## 0.14.2 — 2026-09-19

- An import that finds nothing readable says so, instead of quietly emptying
  the table.

## 0.13.4 — 2026-09-19

- A pinch zooms again, wherever it lands.
- Larger badges, easier to hit with a finger.
- Measurements have a floor, so a field cannot be typed into nonsense.

## 0.12.12 — 2026-09-19

- Left and right pages, and a sheet order that folds into a zine.
- A border drawn by hand.
- A picture from this machine in the row that needs it, and in the export.
- A drawing surface; the drawing goes into the row.
- Pictures can live in a folder of your own, with a panel that empties it.
- Opacity on an area.
- An area's name is its CSS id.
- Copy joins the row actions.

## 0.11.0 — 2026-09-11

- The libelli mark takes the toolbar.

## 0.10.1 — 2026-09-11

- Carbon icons on twelve more controls.
- A grid placed in millimetres, and a dot grid.
- Drag the table's columns to reorder them.
- Enter twice in a dialog takes its default.
- Ctrl/Cmd + Shift + Z holds the last change up against the page.
- The nudge pad, drawn as one cross, and stashable.
- Crop Marks on the sheet, where there is room for them.

## 0.9.0 — 2026-09-11

- Several templates kept in the browser, not one.
- Automagic: a first draft of a card from the table's columns.

## 0.8.8 — 2026-09-09

- Imposition: several cards to one physical sheet, from a shared Print
  Settings panel.
- A real sheet preview, and PNG export that matches it.
- Sheets open full screen, and can be selected for printing.

## 0.7.0 — 2026-09-08

- Type straight into the card; controls sit beside what they change.
- The help panel rewritten.
- The full-screen card hangs against the tilt of a phone and catches the light.
- The cut is drawn, not just warned about.

## 0.6.0 — 2026-09-08

- Turn an area by its lever and move its pivot.
- The first four cards explain the app, and can be brought back.
- Undo says what it undid.

## 0.5.0 — 2026-09-06

- Open a card full screen from the page count; the table follows the pager.

## 0.4.0 — 2026-09-06

- Works offline, and offers to be installed.
- Says when saving fails.

## 0.3.0 — 2026-09-06

- Turn an area, with handles big enough for a finger.
- The editor shows what falls off the page.
- Size and align type without going to the bar.
- Named sheet sizes, and landscape.
- Ctrl/Cmd + P opens Export.

## 0.2.0 — 2026-09-06

- Column reorder and sort, QR code areas, fit and cover for media.
- A page background image, referenced rather than embedded.
- Fill, padding, border and radius on an area.
- Choose which pages print.
- Edit on the page, arrange areas, export PNG.
- Select several areas to align, group, lock or delete together.

## 0.1.0 — 2026-09-05

- Spreadsheet rows in, print-ready A5 cards out: paste or import a table, bind
  columns to areas, print one card per row.
- Undo and redo, a help panel, sample cards to start from.
