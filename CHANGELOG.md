# Changelog

What changed for someone using libelli, newest first. One section per minor
version, headed by the last version it shipped as: a patch rewrites its minor's
heading to the new number and adds its lines there, never a section of its own,
and a section stays short: three lines of what changed, six at the very most,
with how it works left to the README.
The app shows this file under **What's new** — press the version number in the
status bar.

## 0.25.3 — 2026-09-30

- The CSS dialog is an editor: numbered lines, colour as you type, and tabs
  that indent — Tab and Shift + Tab, and Enter keeping the indent.
- Nothing you type there reaches the card until **Apply** (Ctrl/Cmd + Enter) or
  **Save**; **Cancel** puts back what was there. **Starter** fills the editor
  with the example sheet.
- A locked template's CSS opens to read.

## 0.24.0 — 2026-09-29

- What's new: press the version number in the status bar for this list. A dot
  on it after an update means there is something you have not read yet.
- Keys no longer reach the card behind an open dialog: Delete, Ctrl/Cmd + D or
  Enter with the help panel up used to change areas you could not see.

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
- A Stamp border, `find:replace` inside a placeholder, and color names that
  mean what they mean in HTML.
- Zoom about the selected area, a pan button with the nudge pad inside it, and
  Ctrl/Cmd + L to lock the selection.

## 0.18.23 — 2026-09-26

- Drawing happens in the full-size editor: a pencil, a nib, rectangle and
  ellipse, flips, a true crop and a color picker, with every drawing listed in
  the Images tray.
- Automagic layout reads headings word by word, and knows an image column.
- A tooltip for every control, `==highlight==` in Markdown, one accent behind
  every blue.

## 0.17.0 — 2026-09-26

- A tour that shows rather than tells, on a starter card with some style.
- Import & Export moves to the first card.

## 0.16.33 — 2026-09-25

- Placeholders inside an area's words, and a lockable table.
- Page margins: a setting, a guide beside the grid, and something to snap to.
- Images as a tray, with uploads that carry onto areas; every PNG in one ZIP.
- A table menu with Import and Export; drag rows by their number.
- Color with alpha; a QR's quiet zone is the area's padding.

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
- A picture from this machine in the row that needs it, and in the export; a
  drawing surface, and a folder of your own to keep pictures in.
- A border drawn by hand, opacity on an area, and an area's name as its CSS id.

## 0.11.0 — 2026-09-11

- The libelli mark takes the toolbar.

## 0.10.1 — 2026-09-11

- A grid placed in millimetres, and a dot grid; Crop Marks on the sheet, where
  there is room for them.
- Drag the table's columns to reorder them.
- Enter twice in a dialog takes its default; Ctrl/Cmd + Shift + Z holds the
  last change up against the page.
- The nudge pad, drawn as one cross, and stashable.

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
