# The interface's words

Every word libelli shows — a button, a tooltip, a dialog, a message in the
status bar, an error — is in one file:
[`src/lib/i18n/en.json`](../src/lib/i18n/en.json). To change how something is
worded, change it there; nothing else needs to move. To translate the app, that
file is the one to translate.

The words on a card are not in it. A card shows the table's words and the
template's, in the card's own language, which is the template's to set; the
few the app adds there — the page number's separator, a countdown's units —
come from the template's CSS for that reason (README § Language).

## The file

The layout FormatJS extracts and most translation tools import as *FormatJS
JSON* or *Structured JSON*: Weblate, Crowdin, Lokalise, Phrase and Tolgee all
read it. One entry per message, sorted by key:

```json
"table.rowsCopied": {
	"defaultMessage": "{count, plural, one {# row} other {# rows}} copied, ready to paste into a spreadsheet.",
	"description": "Notice after copying rows."
}
```

- The **key** says where the message is used: `table.*` is the table panel,
  `area.*` the area settings, `export.*` the Export screen, `help.*` the Help
  panel, `history.*` the names of undo steps, `common.*` words used in many
  places. Keys never change when the wording does.
- **`defaultMessage`** is the English, in ICU MessageFormat.
- **`description`** says where it appears and what it means, for whoever
  translates it without seeing the screen.

## Writing a message

The messages are [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/),
the format translation tools check and preview:

- `{name}` is a value the app puts in: a file name, a column, a number. Keep
  it, spelled the same; move it wherever the sentence needs it.
- `{count, plural, one {# row} other {# rows}}` picks a wording by number.
  `#` is the number. A language with more forms adds them: `few {…}`,
  `many {…}`, as its plural rules name them. `=0 {…}` is exactly zero.
- `{where, select, left {…} other {…}}` picks a wording by a value that is a
  word, not a number. Keep the option names on the left; translate what is in
  the braces.
- `<strong>…</strong>`, `<em>`, `<kbd>` and `<code>` are emphasis, drawn as
  such. No other tag is drawn, and none can carry a link or a style.
- An apostrophe is just an apostrophe — `the page's` needs nothing — except
  right before `{`, `}`, `<` or, inside a plural, `#`, where it quotes them as
  text: `'{'` is a brace. Two apostrophes, `''`, are always one.
- `%%name%%` is the app's placeholder syntax, written for the user to copy.
  Leave it exactly as it is.

Key names, menu names in InDesign and shortcut keys (`Ctrl/Cmd+Z`) are written
as the reader would see them on their own keyboard and in their own copy of
InDesign. The descriptions say where that applies.

## Checking a change

`npm test` reads the whole file: every message must parse, use only the four
tags, be given exactly the values it names, and be used somewhere — a key the
code asks for that is missing would show on screen as the key itself. `npm run
gates` fails if a component spells out a sentence instead of asking the file
for it. Run both after editing; `npm run verify` runs everything.

## Another language

There is no language switcher yet. When there is, each language is a file
beside this one (`el.json`, `de.json`) with the same keys, and `LOCALE` in
[`src/lib/i18n.ts`](../src/lib/i18n.ts) picks one. Until then a translation can
be prepared in any of the tools above against `en.json` as the source.
