import { parseColor } from './color';
import { newBox } from './template';
import type { Box, Defaults, Mapping, PageSpec, Row } from './types';

/**
 * A first draft of a card, worked out from the spreadsheet.
 *
 * The premise is narrow on purpose: a column called Title holding six words is
 * a heading, a column of `https://` is something to scan, and a column whose
 * cells run to three hundred characters is the body. That is enough to put
 * boxes on a page that are roughly the right size in roughly the right places,
 * which is a far better starting point than eight identical rectangles stacked
 * at the top left — and every one of them is a normal box afterwards, with
 * nothing marking it as generated.
 *
 * Two rules keep this from growing into something it should not be:
 *
 * **It guesses about columns, never about words.** Nothing here reads a cell to
 * decide what to *say*; it reads cells to decide how long they are and what
 * shape they have. The card still renders the row it is given.
 *
 * **The arithmetic is an estimate and is allowed to be wrong.** Type is
 * measured by the browser, not here, so every text box is written `grow` and
 * anchored to the one above it: when the guess is off, the card corrects itself
 * on the first render, and the error moves things down the page rather than
 * over them. That is what lets this be a page of arithmetic instead of a second
 * layout engine, which `CLAUDE.md` forbids for good reasons.
 */

/**
 * What a column is *for*. Two sorts of thing, and the difference matters when
 * the signals disagree:
 *
 * `image`, `link`, `number` and `date` are shapes — checkable facts about the
 * cells, so the data wins over the heading. `title`, `subtitle`, `body`,
 * `label` and `code` are roles — nothing in a string of forty characters says
 * whether it is a heading or a caption, so the heading wins over the data.
 */
export type FieldKind =
	| 'title'
	| 'subtitle'
	| 'body'
	| 'label'
	| 'number'
	| 'date'
	| 'image'
	| 'link'
	| 'code'
	| 'skip';

/** A column, what it was taken for, and how much of that was a guess. */
export interface FieldGuess {
	column: string;
	kind: FieldKind;
	/**
	 * Whether anything actually pointed at this kind. False means it was reached
	 * by elimination — the length of the cells and nothing else — and is what the
	 * review dialog marks so the guessing is visible rather than implied.
	 */
	sure: boolean;
	/** the first non-empty cell, for the dialog to show beside the choice */
	sample: string;
}

export const FIELD_KINDS: FieldKind[] = [
	'title',
	'subtitle',
	'body',
	'label',
	'number',
	'date',
	'image',
	'link',
	'code',
	'skip'
];

export const KIND_LABELS: Record<FieldKind, string> = {
	title: 'Title',
	subtitle: 'Subtitle',
	body: 'Body',
	label: 'Small line',
	number: 'Number',
	date: 'Date',
	image: 'Picture',
	link: 'QR code',
	code: 'Code',
	skip: 'Leave out'
};

// ---- reading a column ------------------------------------------------------

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Headings that name a role outright. Longest-standing spreadsheet habits
 * rather than an attempt at coverage: anything not here falls through to the
 * cells, which is the more reliable signal anyway.
 */
const NAME_HINTS: Array<[FieldKind, string[]]> = [
	['title', ['title', 'name', 'heading', 'header', 'card', 'product', 'item', 'term', 'word', 'question']],
	['subtitle', ['subtitle', 'sub', 'tagline', 'caption', 'role', 'byline', 'strapline', 'summary']],
	['body', ['body', 'content', 'text', 'description', 'notes', 'note', 'detail', 'details', 'answer', 'markdown', 'definition']],
	['label', ['category', 'tag', 'tags', 'section', 'group', 'type', 'kind', 'class', 'status', 'level', 'set']],
	['number', ['price', 'cost', 'amount', 'qty', 'quantity', 'count', 'number', 'no', 'num', 'score', 'points', 'value', 'weight', 'size']],
	['date', ['date', 'day', 'when', 'year', 'created', 'updated', 'due', 'expires', 'published']],
	['image', ['image', 'img', 'photo', 'picture', 'logo', 'avatar', 'cover', 'thumbnail', 'thumb', 'icon', 'art', 'illustration', 'color', 'colour', 'background']],
	['link', ['link', 'url', 'qr', 'website', 'web', 'href', 'address', 'permalink']],
	['code', ['code', 'id', 'sku', 'ref', 'reference', 'isbn', 'serial', 'barcode', 'slug']]
];

const nameKind = (column: string): FieldKind | undefined => {
	const key = normalise(column);
	if (!key) return undefined;
	// Exact match first: a column called "Notes" is a body, but "Note number"
	// should not become one on the strength of its first word.
	for (const [kind, words] of NAME_HINTS) if (words.includes(key)) return kind;
	for (const [kind, words] of NAME_HINTS) {
		if (words.some((word) => word.length > 3 && key.includes(word))) return kind;
	}
	return undefined;
};

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;
const HTTP_URL = /^https?:\/\/\S+$/i;
// A number, with the punctuation people actually type: currency, thousands
// separators, a trailing percent, a leading minus.
const NUMERIC = /^[-+]?[£$€¥]?\s?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d+)?\s?%?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/;
const SLASH_DATE = /^\d{1,4}[/.]\d{1,2}[/.]\d{1,4}$/;
const MONTH_NAME = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
const WORDY_DATE = /^\d{1,2}\s+\w+\s+\d{2,4}$|^\w+\s+\d{1,2},?\s+\d{2,4}$/;
// Markdown a body would carry and a caption would not.
const MARKUP = /(^|\n)\s{0,3}(#{1,3}\s|[-*+]\s|\d+\.\s|>\s)|\*\*|\n\n/;

/** Length past which a column is prose rather than a line of type. */
const BODY_LENGTH = 140;
/** Length under which a column is a caption, a tag or a price. */
const SHORT_LENGTH = 28;

export interface ColumnStats {
	/** non-empty cells */
	filled: number;
	/** median length of the non-empty cells; 0 when there are none */
	median: number;
	longest: number;
	/** how many different values, capped by the sample — a tag column repeats */
	distinct: number;
}

export function columnStats(values: string[]): ColumnStats {
	const filled = values.map((v) => (v ?? '').trim()).filter(Boolean);
	if (!filled.length) return { filled: 0, median: 0, longest: 0, distinct: 0 };
	const lengths = filled.map((v) => v.length).sort((a, b) => a - b);
	return {
		filled: filled.length,
		median: lengths[Math.floor(lengths.length / 2)],
		longest: lengths[lengths.length - 1],
		distinct: new Set(filled).size
	};
}

/**
 * What the cells themselves prove. Every non-empty cell has to agree — one URL
 * in a column of prose is a link somebody pasted into a sentence, not a column
 * of links.
 */
function shapeKind(values: string[]): FieldKind | undefined {
	const filled = values.map((v) => (v ?? '').trim()).filter(Boolean);
	if (!filled.length) return undefined;
	const every = (test: (v: string) => boolean) => filled.every(test);
	if (every((v) => HTTP_URL.test(v))) return every((v) => IMAGE_FILE.test(v)) ? 'image' : 'link';
	// A column of colors is a picture as far as a box is concerned: an `image`
	// box shows whatever its source resolves to, and a color resolves to a fill.
	if (every((v) => parseColor(v) !== null)) return 'image';
	if (every((v) => NUMERIC.test(v))) return 'number';
	if (every((v) => ISO_DATE.test(v) || SLASH_DATE.test(v) || (MONTH_NAME.test(v) && WORDY_DATE.test(v)))) {
		return 'date';
	}
	return undefined;
}

/**
 * One column's kind, and whether anything but its length said so.
 *
 * Shape beats name beats length. A column headed Photo holding paragraphs is
 * prose whatever it is called; a column headed Notes holding forty-character
 * lines is what its heading says, because nothing about forty characters
 * argues otherwise.
 */
export function classifyColumn(column: string, values: string[]): FieldGuess {
	const sample = values.map((v) => (v ?? '').trim()).find(Boolean) ?? '';
	const stats = columnStats(values);
	const shape = shapeKind(values);
	const named = nameKind(column);

	if (stats.filled === 0) return { column, kind: 'skip', sure: false, sample };

	// Prose is the one thing that overrules a shape: a column of long text is a
	// body even where every cell happens to parse as something else.
	const prose = stats.median > BODY_LENGTH || values.some((v) => MARKUP.test(v ?? ''));
	if (prose && shape !== 'image' && shape !== 'link') return { column, kind: 'body', sure: true, sample };
	if (shape) return { column, kind: shape, sure: true, sample };
	if (named) return { column, kind: named, sure: true, sample };

	// Nothing but length left. Long is a body, short and repeating is a tag,
	// short is a line of type — and none of it is better than a guess.
	if (stats.median > BODY_LENGTH) return { column, kind: 'body', sure: false, sample };
	if (stats.median <= SHORT_LENGTH && stats.distinct * 2 <= stats.filled) {
		return { column, kind: 'label', sure: false, sample };
	}
	return { column, kind: stats.median <= SHORT_LENGTH ? 'label' : 'subtitle', sure: false, sample };
}

/**
 * Every column, arbitrated into a set of roles a card can actually hold.
 *
 * Classification answers one column at a time and would happily call four
 * columns the title. This is where the card's shape is imposed: one title, one
 * subtitle, one body, and everything else falls back to a small line. Ties go
 * to the leftmost column, because that is the order the spreadsheet was written
 * in and the order somebody reading it expects to matter.
 */
export function guessRoles(columns: string[], rows: Row[]): FieldGuess[] {
	const guesses = columns.map((column) =>
		classifyColumn(column, rows.map((row) => row[column] ?? ''))
	);

	const only = (kind: FieldKind, keep: (g: FieldGuess) => boolean) => {
		let kept = false;
		for (const guess of guesses) {
			if (guess.kind !== kind) continue;
			if (!kept && keep(guess)) {
				kept = true;
				continue;
			}
			// Demoted rather than dropped: a second title is still worth printing,
			// just not as the title.
			guess.kind = 'label';
			guess.sure = false;
		}
		return kept;
	};

	// The body is the longest of the candidates rather than the first: where two
	// columns both read as prose, the card wants the one with more in it. By the
	// median across the column, not by the first cell — one long opening row is
	// not evidence about the column it sits in.
	const median = new Map(
		guesses.map((g) => [g.column, columnStats(rows.map((row) => row[g.column] ?? '')).median])
	);
	const widest = guesses
		.filter((g) => g.kind === 'body')
		.reduce<FieldGuess | null>(
			(best, g) => (!best || median.get(g.column)! > median.get(best.column)! ? g : best),
			null
		);
	only('body', (g) => g === widest);

	const hasTitle = only('title', () => true);
	only('subtitle', () => true);

	// No column said it was the title, so the first line-length column becomes
	// one. A card with no heading at all reads as a paragraph on a page.
	if (!hasTitle) {
		const candidate = guesses.find((g) => g.kind === 'label' || g.kind === 'subtitle');
		if (candidate) {
			candidate.kind = 'title';
			candidate.sure = false;
		}
	}
	return guesses;
}

// ---- putting them on the page ----------------------------------------------

/** 1pt in millimetres. Type is set in points; everything else here is mm. */
const MM_PER_PT = 25.4 / 72;

/**
 * How wide an average glyph is, as a fraction of the type size.
 *
 * Half an em is the rule of thumb for mixed-case Latin text and it is close
 * enough across the faces this app offers. It is only ever used to *choose* a
 * size — the browser does the line breaking, and `grow` absorbs the difference
 * — so being a few per cent out costs a millimetre of white space, not a
 * broken card.
 */
const AVG_GLYPH_EM = 0.5;

const round = (value: number, places = 1) => {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Characters that fit on one line of the given width, at the given size. */
export const charsPerLine = (widthMm: number, sizePt: number) =>
	widthMm / Math.max(0.01, sizePt * MM_PER_PT * AVG_GLYPH_EM);

/** The largest size at which `chars` still lands within `lines` lines. */
export const sizeForLines = (chars: number, widthMm: number, lines: number) =>
	(widthMm * lines) / Math.max(1, chars * MM_PER_PT * AVG_GLYPH_EM);

/** Millimetres a run of type occupies at a size and a leading. */
const textHeight = (sizePt: number, lineHeight: number, lines = 1) =>
	sizePt * MM_PER_PT * lineHeight * lines;

export interface AutoLayoutInput {
	page: PageSpec;
	defaults: Defaults;
	columns: string[];
	rows: Row[];
	/** the roles to lay out; omitted, they are guessed */
	roles?: FieldGuess[];
	/** injected so a test can pin the ids and two runs can be compared */
	nextId?: () => string;
}

export interface AutoLayoutResult {
	boxes: Box[];
	slots: string[];
	mapping: Mapping;
	/** columns the layout had no room or no use for */
	left: string[];
}

/**
 * Where a card's furniture goes, in bands.
 *
 * Top down: the head (title, subtitle) anchored to the top margin, then the
 * middle (a picture, then the body) anchored under it, then the foot pinned to
 * the bottom margin — small lines at the left, something to scan at the right.
 * The foot is pinned rather than anchored because it is the one part of a card
 * whose place is the paper's, not the text's: a body that runs long should push
 * past the footer, not push the footer off the sheet.
 */
export function autoLayout(input: AutoLayoutInput): AutoLayoutResult {
	const { page, defaults, columns, rows } = input;
	const nextId = input.nextId ?? autoId();
	const guesses = (input.roles ?? guessRoles(columns, rows)).filter((g) => columns.includes(g.column));

	const margin = clamp(Math.round(Math.min(page.w, page.h) * 0.08), 6, 14);
	const contentW = Math.max(10, page.w - margin * 2);
	const contentH = Math.max(10, page.h - margin * 2);
	const gap = round(margin * 0.45);

	const boxes: Box[] = [];
	const mapping: Mapping = {};
	const left: string[] = [];

	const lengthOf = (column: string) => Math.max(1, columnStats(rows.map((r) => r[column] ?? '')).median);
	const pick = (kind: FieldKind) => guesses.find((g) => g.kind === kind);
	const all = (kind: FieldKind) => guesses.filter((g) => g.kind === kind);

	const place = (partial: Partial<Box>): Box => {
		const box = newBox({ id: nextId(), hideWhenEmpty: true, ...partial });
		boxes.push(box);
		if (box.slot) mapping[box.slot] = box.slot;
		return box;
	};

	// ---- the foot, measured first so the middle knows where it ends ----------

	const smallSize = round(clamp(contentW * 0.075, 6, 9.5), 1);
	const smallH = round(textHeight(smallSize, 1.2), 1);

	const linkField = pick('link');
	const qrSide = linkField ? round(clamp(contentW * 0.16, 14, 26)) : 0;

	// Whatever is short and not already spoken for, in column order. Capped by
	// the room a foot may take rather than by a count: a quarter of the card is
	// as much as a footer can have before it is a second body, and how many
	// lines that buys depends on the page, not on a number chosen here.
	const footFields = guesses.filter((g) => ['label', 'number', 'date', 'code'].includes(g.kind));
	const footCapacity = Math.max(1, Math.floor((contentH * 0.25) / smallH));
	const footLines = footFields.slice(0, footCapacity);
	const footH = Math.max(footLines.length * smallH, qrSide);
	const footTop = round(page.h - margin - footH);
	// The foot's left column stops short of the QR rather than running under it.
	const footW = round(qrSide ? contentW - qrSide - gap : contentW);

	footLines.forEach((field, index) => {
		place({
			slot: field.column,
			x: margin,
			y: round(footTop + footH - (footLines.length - index) * smallH),
			w: footW,
			h: smallH,
			size: smallSize,
			lineHeight: 1.2,
			color: '#555555',
			mode: 'plain',
			overflow: 'clip',
			anchor: null
		});
	});

	if (linkField) {
		place({
			slot: linkField.column,
			x: round(page.w - margin - qrSide),
			y: round(page.h - margin - qrSide),
			w: qrSide,
			h: qrSide,
			mode: 'qr',
			overflow: 'clip',
			fit: 'contain',
			anchor: null,
			qr: { level: 'M', margin: 1 }
		});
	}

	// Past that there is genuinely no room, and saying so is better than a card
	// with two lines of type printed over its own footer.
	for (const field of footFields.slice(footCapacity)) left.push(field.column);

	// ---- the head ------------------------------------------------------------

	const titleField = pick('title');
	const subtitleField = pick('subtitle');
	const bodyField = pick('body');
	const imageField = pick('image');

	let previous: Box | null = null;
	/**
	 * Where the next stacked box starts if its anchor is ever broken.
	 *
	 * An anchored box still carries a `y`, and it is not decoration: it is what
	 * the box falls back to when the tie is cut, and what aligning and snapping
	 * read. Kept walking down the page so a generated card that loses its
	 * anchors is untidy rather than a pile at the top margin.
	 */
	let cursor = margin;

	/** Anchor to whatever came before, or sit at the top margin when first. */
	const stack = (partial: Partial<Box>, before: number): Box => {
		const top = previous ? cursor + before : margin;
		const box = place({
			...partial,
			y: round(top),
			...(previous ? { anchor: { to: previous.id, gap: before } } : { anchor: null })
		});
		previous = box;
		cursor = top + box.h;
		return box;
	};

	if (titleField) {
		const size = round(clamp(sizeForLines(lengthOf(titleField.column), contentW, 2), 13, contentW * 0.26));
		stack(
			{
				slot: titleField.column,
				x: margin,
				w: contentW,
				h: round(textHeight(size, 1.1)),
				size,
				lineHeight: 1.1,
				weight: 700,
				mode: 'plain',
				overflow: 'grow'
			},
			0
		);
	}

	if (subtitleField) {
		const titleSize = boxes.find((b) => b.slot === titleField?.column)?.size ?? defaults.size * 2;
		const size = round(clamp(titleSize * 0.45, 8.5, 18), 1);
		stack(
			{
				slot: subtitleField.column,
				x: margin,
				w: contentW,
				h: round(textHeight(size, 1.25)),
				size,
				lineHeight: 1.25,
				mode: 'plain',
				overflow: 'grow'
			},
			round(gap * 0.4)
		);
	}

	// ---- the middle ----------------------------------------------------------

	if (imageField) {
		// Wide rather than tall: a picture that takes half the card leaves the
		// body nowhere to go, and a card is usually read for its words.
		const height = round(clamp(contentW * 0.6, 20, contentH * 0.4));
		stack(
			{
				slot: imageField.column,
				x: margin,
				w: contentW,
				h: height,
				mode: 'image',
				overflow: 'clip',
				fit: 'cover'
			},
			gap
		);
	}

	if (bodyField) {
		const size = round(clamp(contentW * 0.105, 8, Math.max(8, defaults.size)), 1);
		// Down to the foot, or three lines' worth when the head has already eaten
		// the page — it grows, so the floor only has to be a sane starting height.
		const height = Math.max(
			round(textHeight(size, defaults.lineHeight, 3)),
			round(footTop - gap - (previous ? cursor + gap : margin))
		);
		stack(
			{
				slot: bodyField.column,
				x: margin,
				w: contentW,
				h: height,
				size,
				lineHeight: defaults.lineHeight,
				mode: 'markdown',
				overflow: 'grow',
				// The built-in card's block metrics: headings that are clearly
				// headings at card sizes, and paragraphs that breathe without
				// leaving a gap you could park a line in.
				md: {
					h1: { size: 1.5, spaceBefore: 6, spaceAfter: 1.5 },
					h2: { size: 1.35, spaceBefore: 6, spaceAfter: 1.5 },
					h3: { size: 1.15, spaceBefore: 4, spaceAfter: 1 },
					paragraph: { spaceAfter: 3 },
					list: { indent: 7, markerGap: 4, itemSpacing: 1.5 }
				}
			},
			gap
		);
	}

	// Anything left that is neither foot nor head — a second picture, a second
	// thing to scan — follows the body as a small line, so it is on the card and
	// can be moved rather than quietly discarded. As a *line*, whatever it was
	// taken for: a second picture at picture size would push the page over on its
	// own, and one line of its address is at least a box pointing at the column.
	const placed = new Set(boxes.map((b) => b.slot));
	for (const field of guesses) {
		if (field.kind === 'skip' || placed.has(field.column) || left.includes(field.column)) continue;
		const box = stack(
			{
				slot: field.column,
				x: margin,
				w: contentW,
				h: smallH,
				size: smallSize,
				lineHeight: 1.2,
				color: '#555555',
				mode: 'plain',
				overflow: 'grow'
			},
			round(gap * 0.5)
		);
		// These follow a body that has already reached the foot, so their declared
		// tops are the one place in this pass that can walk off the bottom of the
		// page. The anchor still puts them under the body where they belong; this
		// only keeps the fallback somewhere you can see it.
		box.y = Math.min(box.y, round(page.h - margin - box.h));
		placed.add(field.column);
	}

	return { boxes, slots: boxes.map((b) => b.slot).filter((s): s is string => !!s), mapping, left };
}

/**
 * Ids for a run that nobody supplied one for. Sequential within the run so a
 * generated template diffs cleanly; the caller passes `nextBoxId` when the
 * boxes have to be unique against a template that already has some.
 */
function autoId(): () => string {
	let n = 0;
	return () => `b_auto${(++n).toString(36)}`;
}
