# libelli

Spreadsheet rows in, print-ready cards out — all of it in the browser.

- **Project page** — https://heracl.es/libelli
- **Live instance** — https://libelli.vercel.app
- **Source** — https://github.com/Arty2/libelli

*Libelli* is the plural of *libellus*, a little book — about the size of the
thing coming out of your printer. The dragonfly in the mark is the same word
taking another turn: a *libellula* is one of those.

## What it is for

Somebody has a list and needs it on paper. Forty plants for a nursery's
labels, a run of recipes, the works in an exhibition, a deck of revision
cards, a zine. The list already lives in a spreadsheet; what it lacks is a
page.

libelli gives it one. Paste the table in, draw a few areas on a card, tell
each area which column it speaks for, and print — one card for every row.
The card on screen is the card on paper: the editor and the printer read the
same layout, so there is nothing to drift apart between them.

## How it goes

**The table.** Cells copied straight out of Excel, Sheets or Coda, or a CSV
file — quoted fields, line breaks inside a cell, Markdown and all. A cell is
always text: `<b>x</b>` prints as those characters, never as bold.

**The page.** A white sheet on a grey ground, A5 unless you say otherwise,
measured in millimetres from the trim edge, so changing the paper or adding
bleed moves nothing you placed. An area takes its words from a column, holds
words of its own, or holds a picture. Areas can follow one another down the
page, grow to fit, shrink their type to fit, or step aside when their column
is empty, so a card without a subtitle has no hole where it would have been.
*Layout* will read your columns and propose a first draft, if you would
rather start from something.

**The print.** Export shows every card as a small page before a sheet of
paper is spent, with the four browser settings that usually go wrong spelled
out beside them. Print one card to a page, tile several to a sheet, or fold
them into a booklet. PNGs come out at 300 dpi, as one ZIP when there are many.

## Some of what is in the drawer

- **Placeholders** — `%%title%%` quotes a column anywhere words are typed;
  `%%today%%`, `%%page:current%%` and `%%toc:title%%`, a table of contents,
  come with it.
- **Codes** — QR, Code 128 and EAN-13, drawn as vectors so they stay sharp at
  any size, and each one in the tests read back once by an independent
  decoder.
- **Drawings** — a small pixel board, saved into the cell itself, so a row's
  sketch travels with the table.
- **Booklets** — recto and verso pages that mirror across the fold, page
  numbers on the outer edge, and the eight-page mini zine imposed on one sheet.
- **A stylesheet of its own** — every template takes CSS, scoped to the card;
  *Starter* writes out what this template holds, ready to hand to a person or
  to a model.
- **Fonts** — Google families, the faces a computer already has, or files of
  your own, kept in this browser.

It installs as an app where the browser offers that, and keeps a copy of
itself so it opens with the network off.

Every control explains itself: rest the pointer on it, or press and hold it on
a phone. For the rest — every switch, the keyboard, the gestures — there is
the [guide](docs/guide.md).

## What leaves this machine

Nothing you type, draw or import is uploaded. There is no backend, no account
and no analytics: tables, templates, pictures and fonts stay in this browser,
and pictures can live in a folder of your own where the browser allows one. Three things do reach
the network, each because you asked for it by name:

- **Google fonts.** Choosing a Google family — or opening a template that
  names one — fetches that family's stylesheet from `fonts.googleapis.com`. A
  template from a stranger can therefore make a request the moment it opens;
  the family name is all it controls, and anything that is not a family name
  is refused. Opening a font menu fetches the faces it lists, so each name can
  be shown in its own. Upload the font file instead and nothing is requested.
- **A linked background image**, when a template names one: only ever an
  http(s) address, and only that one.
- **The app's own files**, cached so it works offline.

That is the whole list. A template's CSS cannot add to it — `@import` and
remote `url()` are stripped before it reaches the page — and a cell cannot
either: a stored picture is named `local:name`, which no browser mistakes for
an address.

## Working on it

A static SvelteKit site with no runtime dependencies: the Markdown renderer,
the CSV parser and the barcode encoders are written here, so nothing can rot
underneath it.

```bash
npm install
npm run dev      # http://localhost:5173
npm run verify   # gates, lint, units and types — the one to run while working
npm run build    # static output in ./build, for any static host
```

| Change    | Version                        |
| --------- | ------------------------------ |
| A fix     | 0.28.51 → 0.28.52              |
| A feature | 0.28.51 → 0.29.0               |
| Anything  | the leading zero never moves   |

[`AGENTS.md`](AGENTS.md) is what to know before touching the code,
[`docs/decisions.md`](docs/decisions.md) the reasons behind each module,
[`CHANGELOG.md`](CHANGELOG.md) what each version brought, and the
[guide](docs/guide.md#developer-and-testing) the rest of the tooling.

## Credit

[Dialectic Acheiropoieton](https://heracl.es/libelli) of Heracles Papatheodorou
and&nbsp;Claude

MIT License.
