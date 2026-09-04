# A5 Card Studio — implementation plan

A front-end-only SvelteKit app that turns tabular data (pasted from Excel/Coda, or a CSV) into print-ready A5 cards using a WYSIWYG box-based template editor.

Target output: an instruction card with a title, an optional subtitle, a long Markdown body, and a footer line. Two of the four sample cards carry a subtitle and two do not.

---

## 1. Locked decisions

These were settled during planning. Do not re-litigate them while building; if one turns out to be wrong, stop and flag it rather than silently swapping approaches.

| Decision | Choice | Why |
|---|---|---|
| Framework | SvelteKit, `adapter-static`, `prerender = true` | Deploys to Vercel free as pure static output. No serverless functions anywhere. |
| Backend | None | No server-side storage of any kind. Nothing leaves the browser. |
| Rendering | **DOM** — absolutely-positioned divs inside an A5-sized page div | The browser already does line breaking, wrapping, bold-inside-paragraph, `@font-face`. Canvas gives only `measureText()` and would require hand-writing an inline layout engine; canvas→PDF is also raster. |
| PDF output | Browser print, `@page { size: A5; margin: 0 }` | Editor and printed output share one layout engine, so they cannot drift. |
| Paged.js | **Not in v1** | Cards are already page-sized units; `break-after: page` handles pagination natively. Revisit only if a card must flow onto a second page. |
| Units | Millimetres everywhere in the data model | Pixels are meaningless on paper and break when page size changes. |
| Storage | `localStorage` for small settings + column mapping; **IndexedDB** for fonts, templates, and datasets | localStorage is string-only and ~5MB origin-wide; base64 font bytes blow through it fast, and its sync API blocks the main thread. IndexedDB is equally client-side — the "no server" principle is fully honoured. |
| Column mapping | Stored **outside** the template | A template welded to one spreadsheet's headers cannot be shared, which defeats import/export. |

---

## 2. Data model

### 2.1 Template file (`.json`, the shareable artifact)

```json
{
  "schema": 1,
  "name": "A5 Instruction Card",
  "page": { "w": 148, "h": 210, "unit": "mm" },
  "bleed": 0,
  "fonts": [
    { "family": "Patrick Hand", "source": "google" },
    { "family": "House Sans", "source": "local", "ref": "font:house-sans" }
  ],
  "defaults": { "font": "Patrick Hand", "size": 11, "lineHeight": 1.35, "color": "#000" },
  "boxes": [
    {
      "id": "b_title",
      "slot": "title",
      "x": 12, "y": 14, "w": 124, "h": 18,
      "font": "Patrick Hand", "size": 30, "weight": 700,
      "lineHeight": 1.1, "align": "left", "color": "#000",
      "mode": "plain",
      "overflow": "clip"
    },
    {
      "id": "b_body",
      "slot": "body",
      "x": 12, "y": 40, "w": 124, "h": 150,
      "size": 11, "mode": "markdown", "overflow": "grow"
    },
    {
      "id": "b_logo",
      "slot": null,
      "x": 12, "y": 196, "w": 20, "h": 8,
      "mode": "image",
      "static": { "svg": "<svg …></svg>" }
    }
  ]
}
```

Box fields:

- `mode`: `plain` | `markdown` | `image`
- `overflow`: `clip` (fixed height, `overflow: hidden`) | `grow` (fixed top edge, height auto, `min-height: h`)
- `slot`: the name a dataset column gets bound to. `null` means static content, taken from `static`.
- `static`: `{ text }`, `{ svg }`, `{ url }`, or `{ dataUrl }` for boxes not driven by data.
- `hideWhenEmpty`: when its bound column is blank, the box collapses to zero height instead of leaving a gap.
- `anchor`: `{ to: boxId, gap: mm }` — the box's top edge follows the *rendered* bottom of another box rather than its own `y`.
- Omitted style fields inherit from `defaults`.

**Anchors are required, not optional.** Two of the four reference cards have a subtitle and two do not; without anchoring, the empty ones leave a dead band above the body. Resolve anchors in one topological pass after layout: measure each anchored box's target with `getBoundingClientRect()`, convert px back to mm, set the follower's top. Reject cycles and limit to a single chain depth in v1. A box with `anchor: null` is pinned to its own `y` — use that for anything that must sit at a fixed place on the page, like the footer.

`schema` is mandatory and load-bearing. The format will change within a month; a version field is the difference between a ten-line migration and silently corrupting saved work.

### 2.2 Runtime state (never inside the template file)

```json
{
  "columns": ["Name", "Subtitle", "Content", "Record ID", "Date"],
  "rows": [ { "Name": "Watering the Ferns", "…": "…" } ],
  "mapping": { "title": "Name", "body": "Content", "footer_left": "Record ID" },
  "activeRow": 0,
  "ui": { "showOutlines": true, "zoom": "fit" }
}
```

`mapping` and `ui` go in localStorage. `rows` and any uploaded font bytes go in IndexedDB.

---

## 3. UI specification

```
┌──────────────────────────────────────────────────────────────┐
│  toolbar: template name · Import · Export · Contact sheet ·  │
│           Outlines [x] · Print                               │
├──────────────────────────────────────────────────────────────┤
│  options bar (context: selected box, else page)              │
│  [column ▾][font ▾][size][weight][align][mode ▾][overflow ▾] │
│  [x][y][w][h]  ·  Duplicate  Delete                          │
├───────────────────────────────┬──────────────────────────────┤
│                               │  data table                  │
│      ┌───────────────────┐    │  ┌──┬───────┬───────┬─────┐  │
│      │                   │    │  │ ●│ Name  │ Body  │ ID  │  │
│      │   A5 page, white  │    │  ├──┼───────┼───────┼─────┤  │
│      │   soft shadow     │    │  │ 1│ …     │ …     │ …   │  │
│      │   dashed outlines │    │  │ 2│ …     │ …     │ …   │  │
│      │                   │    │  └──┴───────┴───────┴─────┘  │
│      └───────────────────┘    │  [ Paste from Excel ]        │
│                               │  [ Import CSV ] [ + Row ]    │
└───────────────────────────────┴──────────────────────────────┘
```

- Background `#eee`. Page is white with a soft drop shadow. Chrome stays quiet — the page is the only element with visual weight.
- Preview left, table right, options bar spanning above the page.
- Clicking a table row makes that row the previewed card.
- Outlines toggle draws a dashed 1px border on every box (screen only; never printed).
- Contact sheet: modal grid of every row rendered as a small page. Click one to open fullscreen; ← / → move between cards; Esc closes.
- Boxes are dragged and resized directly on the page. Handles are absolutely-positioned divs; convert pointer deltas to mm by dividing by the preview scale and by `96/25.4`.

Quality floor: visible keyboard focus, `prefers-reduced-motion` respected, the layout collapsing to stacked panels under ~900px.

---

## 4. Milestones

Ship each one working before starting the next.

**M1 — Data in.** Paste TSV from Excel and import CSV. Parse into `columns` + `rows` with correct quoted-field and embedded-newline handling. Render an editable table. Add/delete rows and columns.

**M2 — Render and print.** Commit the card template to `src/lib/templates/` and a sample dataset to `static/`. Render the active row into an A5 page, then print all rows, one card per page. *This proves the riskiest part on day one — do it before any editor UI exists.*

**M3 — Mapping.** Per-box dropdown binding a slot to a column. Persist mapping to localStorage keyed by template name.

**M4 — Box editor.** Select, drag, resize, duplicate, delete, add. Options bar writes into the template object. Outlines toggle.

**M5 — Fonts.** Curated Google Families list plus a free-text family field; inject a `<link>` per family. Local `.woff2`/`.otf`/`.ttf` upload via `FontFace` + IndexedDB. On import, if a referenced font is missing, prompt for a file — never silently substitute.

**M6 — Import/export + contact sheet.** Template export in two flavours (see §5). Contact sheet with fullscreen zoom and arrow navigation.

**M7 — Persistence.** Autosave template, mapping, and dataset. "Reset everything" button.

---

## 5. Export flavours

- **Export template** — fonts referenced by family name. Small, diffable, git-friendly. The default.
- **Export bundle** — font bytes and images embedded as base64. Self-contained, larger.

Images: external URL (tiny but rots), data URL (portable but bloats), or inline SVG string (small, sharp, no encoding — preferred for logos and icons).

---

## 6. Markdown subset

Write a small renderer in `src/lib/markdown.ts`. No external dependency; this keeps the app fully offline-capable.

Support: `#`/`##`/`###` headings, `-` and `*` bullets (one nesting level), `1.` ordered lists, `**bold**`, `*italic*`, `` `code` ``, `[text](url)`, blank-line paragraphs, `---`.

Everything else renders as literal text. **Escape HTML in every leaf text node** — pasted spreadsheet content will contain `<`, `&`, and stray angle brackets.

Ordered-list note: renumber sequentially from the source order, so a dataset whose numbering restarts part-way through still prints as one continuous list.

---

## 7. Print details

```css
@page { size: A5; margin: 0 }
.card { width: 148mm; height: 210mm; break-after: page; overflow: hidden }
.card:last-child { break-after: auto }
```

Render all cards into a dedicated print container on print; hide the app chrome via `@media print`. Show a persistent in-app instruction panel near the Print button:

> In the print dialog: set **Margins** to *None*, uncheck **Headers and footers**, and enable **Background graphics**.

That last one catches people out — Chrome drops background colours by default.

**Bleed is configurable per template**, via `bleed: { enabled, amount, cropMarks }`.

Implement it as an outset on the page box, not an offset on content. Box coordinates stay measured from the trim edge, so toggling bleed never moves a single box. When enabled, the `@page` size becomes `(w + 2·amount) × (h + 2·amount)`, the card div gets `padding: {amount}mm` with the trim area inset inside it, and any full-bleed background extends into the padding. Crop marks are four L-shaped corner rules drawn in the bleed margin, print-only.

---

## 8. Suggested file layout

```
src/
  lib/
    types.ts            template + runtime types
    storage.ts          localStorage + IndexedDB wrappers
    parse.ts            CSV / TSV parsing
    markdown.ts         markdown subset renderer
    fonts.ts            Google + local font loading
    template.ts         defaults, migrations, import/export
    components/
      PagePreview.svelte
      Box.svelte
      DataTable.svelte
      OptionsBar.svelte
      ContactSheet.svelte
      PrintRoot.svelte
  routes/+page.svelte
static/
```

---

## 9. Acceptance checks

- Pasting the four sample cards produces four A5 pages laid out as specified.
- A `grow` box lengthens downward as body text grows; a `clip` box hard-cuts.
- Exported template imports cleanly in a fresh browser profile with mapping re-prompted, not assumed.
- A cell containing `<b>x</b> & "y"` renders literally, not as markup.
- Print produces exactly one page per row with no blank trailing page.
- Changing `page.w`/`page.h` moves nothing, because all coordinates are already in mm.
- A card without a subtitle and a card with one both start their body immediately below whatever precedes it, with no dead band on the former.
- Toggling `bleed.enabled` changes only the page size and margins — every box stays visually where it was.
- The category footer stays pinned at 199mm regardless of how long the body runs.

---

## 10. Non-goals for v1

Multi-page flow within one card, running headers, page numbering, nested list indentation beyond one level, collaborative editing, direct Coda API access.
