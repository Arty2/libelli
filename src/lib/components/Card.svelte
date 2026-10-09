<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { backgroundStyle, cssUrl, localImageName, safeMediaUrl } from '$lib/assets';
	import { parseColor } from '$lib/color';
	import { UNKNOWN_CLOSE, UNKNOWN_OPEN, applyPlaceholders } from '$lib/placeholders';
	import { cssIdent, isPageId, scopeCss, styleTag } from '$lib/css';
	import { cardVars } from '$lib/csskit';
	import { fontStack } from '$lib/fonts';
	import { handBorder, type HandStroke } from '$lib/hand';
	import { followsInSet, isParked } from '$lib/boxops';
	import type { Theme } from '$lib/theme';
	import { HOLD_SLOP } from '$lib/gestures';
	import {
		FREE_STEP,
		GRID_MINOR,
		bleedFor,
		boxEdges,
		facingPosition,
		mirrorBox,
		quarterTurn,
		facingRotation,
		mirrors,
		pageSide,
		pxToMm,
		mmToPx,
		resolveLayout,
		latchSpan,
		snapTo,
		snapToEdges,
		columnGaps,
		shrinkScale,
		spacingReadouts,
		referenceOf
	} from '$lib/layout';
	import { flagUnknown, leaderStyle, renderMarkdown, tabSplit } from '$lib/markdown';
	import { completePlaceholders } from '$lib/complete';
	import { croppable, cropToInk, tileOf } from '$lib/tile';
	import { DEFAULT_ORPHANS, DEFAULT_WIDOWS, baselineOf, colorsFromRow, frameHeight, listOf, marginsOf, normaliseRotation, shownAsMedia, sidesOf, takesADrawing } from '$lib/template';
	import { qrSvg } from '$lib/qr';
	import { barcodeSvg } from '$lib/barcode';
	import { runOf } from '$lib/table';
	import type { Box, Leader, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row?: Row | null;
		/**
		 * The whole table, for `%%lookup:ROW:COLUMN%%`. Required, not defaulted:
		 * a renderer that forgot it would print the placeholder on paper while the
		 * editor showed the value, and nothing would have failed.
		 */
		rows: readonly Row[];
		mapping?: Mapping;
		/**
		 * Zoom and pan: a press on an area is left to the page — one finger
		 * scrolls it, two pinch it — and never moves it; a tap still chooses it.
		 * See PagePreview's `panning`.
		 */
		panning?: boolean;
		/** dashed box bounds and the bleed marker; screen only, never printed */
		bounds?: boolean;
		/** every tie drawn as its thread, not only the one pointed at — with the bounds */
		ties?: boolean;
		/** families still arriving, so an area can say so rather than sit in the fallback */
		loadingFonts?: string[];
		/** snap drags to the 5mm subgrid */
		grid?: boolean;
		/** draw the page margins, and snap to them */
		guides?: boolean;
		/**
		 * The temporary guides: while a box is dragged it latches onto another
		 * box's edges and middle, and onto the page's centre lines, and a line
		 * shows what it caught. On a switch of its own, apart from the margins,
		 * so they can be had without the margins drawn.
		 */
		smartGuides?: boolean;
		/**
		 * The millimetres a dragged area has to its neighbours and to the page
		 * edge, drawn as it moves — `spacingReadouts`.
		 */
		spacing?: boolean;
		/** preview scale, used only to convert pointer deltas back to mm */
		scale?: number;
		interactive?: boolean;
		selectedIds?: string[];
		/** 1-based position of this card in the run; drawn when the template asks for it */
		pageNumber?: number | null;
		/** how many cards there are, for the X/Y form of the page number */
		pageCount?: number | null;
		/**
		 * The interface's theme, as this page is seen in it — `theme-light`,
		 * `theme-dark` or `theme-dark-page` on the page, for a template's CSS.
		 * Light unless said, and only the editor's page says otherwise. The
		 * print screen's thumbnails are inverted with dark-page too, but stay
		 * light here on purpose: PNG export reads those same thumbnails, and a
		 * dark-only rule must never be baked into a file.
		 */
		theme?: Theme;
		/** the area whose words are being typed straight into the card, if any */
		editingId?: string | null;
		/**
		 * Areas to flash. A move you did not watch happen — an area brought back
		 * onto the sheet from off it — needs to say which areas moved, or the
		 * card simply looks different and you have to work out why.
		 */
		flashIds?: string[];
		/**
		 * The template's background image, already resolved to something a
		 * `background-image` can use. Resolved by the app rather than here,
		 * because reading it back out of storage is asynchronous and this
		 * component has to stay a pure function of its props.
		 */
		background?: string | null;
		/**
		 * Images this browser is holding, by the name a cell calls them —
		 * `local:sketch.png` finds `images['sketch.png']`. Resolved by the app for
		 * the same reason the background is: reading bytes out of storage is
		 * asynchronous, and this component is a pure function of its props.
		 */
		images?: Record<string, string>;
		/** `additive` is a modifier-click: add to or drop from the selection */
		onselect?: (id: string | null, additive?: boolean) => void;
		/** an image file dropped on an area, for the app to store and bind */
		onimagedrop?: (box: Box, file: File) => void;
		onchange?: (box: Box) => void;
		/** right-click on a box, in viewport coordinates */
		onmenu?: (id: string, x: number, y: number) => void;
		/**
		 * The drag has gone far enough to be a drag, so anything the press before
		 * it opened is in the way.
		 *
		 * A finger has one gesture for both: the long press that opens the menu
		 * is the beginning of the press-and-drag that moves the area, and the
		 * pointer never went up in between. The drag is already running by then —
		 * it started at pointerdown, under the menu — so all that is needed is to
		 * take the menu off it.
		 */
		onmenuclose?: () => void;
		/** what a drag is about to do, so undo can name it afterwards */
		onaction?: (what: string) => void;
		/** start or stop typing into an area on the card itself */
		onedit?: (id: string | null) => void;
		/** open the drawing surface for an area; a picture is never edited in place */
		ondraw?: (id: string) => void;
		/** open the cell a Data Field area prints, full size in the table */
		oneditcell?: (id: string) => void;
		/** drawn over the paper and under everything else — the stage's grid */
		underlay?: Snippet;
		/**
		 * Words typed into the card. The card cannot write them itself: a bound
		 * area's text is a cell in the dataset and a static one's is a field in
		 * the template, and only the app knows which of the two it is holding.
		 */
		ontext?: (box: Box, value: string) => void;
	}

	let {
		template,
		row = null,
		rows,
		mapping = {},
		bounds = false,
		ties = false,
		loadingFonts = [],
		grid = false,
		guides = false,
		smartGuides = false,
		spacing = false,
		scale = 1,
		interactive = false,
		panning = false,
		selectedIds = [],
		pageNumber = null,
		background = null,
		images = {},
		pageCount = null,
		theme = 'light',
		editingId = null,
		flashIds = [],
		onselect,
		onchange,
		onimagedrop,
		onmenu,
		onmenuclose,
		onaction,
		onedit,
		ondraw,
		oneditcell,
		underlay,
		ontext
	}: Props = $props();

	let measured = $state<Record<string, number>>({});
	/** boxes whose content is taller than the box will let it be */
	let overflowing = $state<Record<string, boolean>>({});
	/**
	 * The scale a Shrink area's words are set at on this card, by box id; absent
	 * is full size. Per card, because each row has its own words: the long name
	 * is set small and the short one beside it is not.
	 */
	let shrunk = $state<Record<string, number>>({});
	/**
	 * The edge a live drag has latched onto, drawn as a guide until it lets go.
	 * `flip` records that the latch was measured against a mirrored box, so the
	 * line is drawn where the eye sees the edge rather than where the template
	 * stores it.
	 */
	let guide = $state<{ x: number | null; y: number | null; flip?: boolean }>({ x: null, y: null });
	/**
	 * The area being dragged, once it has moved, with the ones moving with it:
	 * what the spacing is measured from, and what it is not measured to. State,
	 * where `drag` is not, so the readouts follow the layout as it changes.
	 */
	let spaced = $state<{ id: string; with: string[] } | null>(null);
	/**
	 * The spacing readouts, in the frame the card is drawn in: on a left-hand
	 * page a mirrored area is measured where it is seen, not where it is stored.
	 * Hidden areas take no room, so nothing is measured to one.
	 */
	const readouts = $derived.by(() => {
		if (!spacing || !spaced) return [];
		const rectOf = (b: Box) => {
			const drawn = placed(b);
			return { x: drawn.x, y: layout.tops[b.id] ?? b.y, w: b.w, h: layout.heights[b.id] ?? b.h };
		};
		const box = template.boxes.find((b) => b.id === spaced!.id);
		if (!box) return [];
		const skip = new Set([spaced.id, ...spaced.with]);
		const others = template.boxes.filter((b) => !skip.has(b.id) && !hidden.has(b.id)).map(rectOf);
		// Read out from the reference point, the one the bar's X and Y name.
		const rect = rectOf(box);
		const { fx, fy } = referenceFor(box);
		return spacingReadouts(rect, others, template.page, { x: rect.x + rect.w * fx, y: rect.y + rect.h * fy });
	});

	/**
	 * What the area actually holds — a cell of the row, or its own words. This is
	 * the text as written, which is what the inline editor has to put in front of
	 * you: substituting into it would mean typing over yesterday's date.
	 */
	const rawContentOf = (box: Box): string => {
		if (box.slot) {
			const column = mapping[box.slot];
			const value = column ? row?.[column] : undefined;
			return value == null ? '' : String(value);
		}
		return box.static?.text ?? '';
	};

	/**
	 * The same text as it is drawn, with `%%today%%` and any `%%column%%` of this
	 * row filled in — in a cell and in an area's own words alike, once.
	 */
	/** The rows in the order they print, for a contents — `runOf`. */
	const run = $derived(runOf(rows));
	const contentOf = (box: Box): string => applyPlaceholders(rawContentOf(box), { row, rows, run, self: selfOf(box), page: pageNumber, pageCount });

	/** The column a bound area's words come out of — the one they may not quote. */
	const selfOf = (box: Box): string | undefined => (box.slot ? mapping[box.slot] : undefined);

	/**
	 * The text as the editor draws it: `contentOf`, except that a `%%name%%`
	 * nothing answers to is marked so it can be underlined — a typo in a
	 * column name otherwise prints as written, and is found on
	 * paper. Only for words drawn as words, and only with the bounds on, with
	 * the rest of the screen furniture; never in anything that is printed,
	 * measured for emptiness, or encoded into a QR.
	 */
	const shownTextOf = (box: Box): string =>
		applyPlaceholders(rawContentOf(box), { row, rows, run, self: selfOf(box), page: pageNumber, pageCount, markUnknown: interactive && bounds });

	/** Text split around the marks, for plain text, which Svelte escapes itself. */
	function segments(text: string): Array<{ text: string; unknown: boolean }> {
		if (!text.includes(UNKNOWN_OPEN)) return [{ text, unknown: false }];
		const out: Array<{ text: string; unknown: boolean }> = [];
		for (const part of text.split(UNKNOWN_OPEN)) {
			const end = part.indexOf(UNKNOWN_CLOSE);
			if (end === -1) {
				if (part) out.push({ text: part, unknown: false });
				continue;
			}
			out.push({ text: `%%${part.slice(0, end)}%%`, unknown: true });
			if (end + 1 < part.length) out.push({ text: part.slice(end + 1), unknown: false });
		}
		return out;
	}

	/** The area's paragraph style, or the page's when it names none of its own. */
	const paragraphOf = (box: Box) => box.paragraph ?? template.defaults.paragraph;
	/** The tab leader an area draws, over the page's; undefined where it draws none. */
	const leaderOf = (box: Box): Leader => box.leader ?? template.defaults.leader ?? 'none';

	/**
	 * What an image area resolves to: a picture, a fill, or nothing at all.
	 *
	 * The mode is one mode on purpose — see `BoxMode` — so the value decides.
	 * A color wins over a URL because nothing that parses as a color is also a
	 * usable address, and a value that is neither draws nothing rather than
	 * reaching a `src` attribute: a cell is untrusted, and `safeMediaUrl` is the
	 * only door between one and an `<img>`.
	 */
	function mediaOf(box: Box): { svg?: string; src?: string; color?: string } {
		if (box.static?.svg) return { svg: box.static.svg };
		const written = box.slot ? contentOf(box) : (box.static?.dataUrl ?? box.static?.url ?? '');
		const value = written.trim();
		if (!value) return {};
		// A fill and nothing else: a cell of this column is a color or it is a
		// mistake, and an address in one would otherwise be fetched.
		if (box.mode === 'color') {
			const only = parseColor(value);
			return only ? { color: only } : {};
		}
		// An image this browser is holding, named by the cell. Nothing when it
		// is a name this browser has never seen — the same blank as an address
		// that does not resolve, and the app says which names are missing.
		const local = localImageName(value);
		if (local) return images[local] ? { src: images[local] } : {};
		// `image` still answers to a color, because it was the only mode for
		// both and templates written then rely on it. `bitmap` does not: what
		// goes in one of those cells is a drawing.
		if (box.mode === 'image') {
			const color = parseColor(value);
			if (color) return { color };
		}
		const src = safeMediaUrl(value);
		return src ? { src } : {};
	}

	const isEmpty = (box: Box) => {
		if (shownAsMedia(box.mode)) {
			const media = mediaOf(box);
			return !(media.svg || media.src || media.color);
		}
		return contentOf(box).trim() === '';
	};

	/**
	 * A code is only worth printing if it scans, so anything the encoder refuses
	 * — empty text, more than a version-10 QR can hold, a character Code 128 has
	 * not got, an EAN with the wrong check digit — renders as nothing rather
	 * than as bars no scanner will read.
	 *
	 * A barcode ignores Fit: it is read across, so it fills the area both ways,
	 * every bar widened alike.
	 */
	function qrFor(box: Box): string {
		const value = contentOf(box).trim() || box.static?.text?.trim() || '';
		if (!value) return '';
		try {
			if (box.qr?.kind) {
				return barcodeSvg(value, box.qr.kind, {
					color: box.color ?? template.defaults.color,
					background: box.qr.background
				});
			}
			return fitSvg(
				qrSvg(value, {
					level: box.qr?.level ?? 'M',
					// No quiet zone of the code's own: the area's padding is the space
					// round it, the same control every other area uses, and the old
					// setting beside it was a second way to say one thing.
					margin: 0,
					color: box.color ?? template.defaults.color,
					background: box.qr?.background
				}),
				box.fit
			);
		} catch {
			return '';
		}
	}

	/**
	 * How tall a picture or a code is drawn: the area's declared height, less
	 * its padding and border. It was the whole height, so padding pushed the
	 * picture down and out of the bottom of the area instead of framing it.
	 */
	const mediaHeight = (box: Box): string => `${frameHeight(box)}mm`;

	/**
	 * `object-fit` does nothing to an inline SVG, so the equivalent goes on the
	 * root element instead: meet fits the whole thing in, slice crops it.
	 */
	function fitSvg(svg: string, fit: Box['fit']): string {
		const ratio = fit === 'cover' ? 'xMidYMid slice' : fit === 'fill' ? 'none' : 'xMidYMid meet';
		return svg.replace(/^(\s*<svg\b)([^>]*)>/i, (_whole, open: string, attrs: string) => {
			return `${open}${attrs.replace(/\spreserveAspectRatio="[^"]*"/i, '')} preserveAspectRatio="${ratio}">`;
		});
	}

	/** No row behind the card at all — an empty table, or one just cleared. */
	const dataless = $derived(interactive && !row);

	/**
	 * An area with nothing to draw from, as against one whose cell happens to
	 * be blank on this card.
	 *
	 * Two ways to have nothing: there is no row at all, or the area is bound to
	 * a column the data has not got — an unmapped slot, or one still pointing
	 * at a column that has been renamed or deleted. Either way the area will be
	 * empty on every card there is, so hiding it is not showing anyone what
	 * this row prints; it is taking a piece of the design away and giving no
	 * way to get it back. Which is what it did: set to hide when empty, such an
	 * area collapses to no height and no visibility, and a sheet of those
	 * cannot be clicked, selected or moved.
	 *
	 * An area bound to a column that *does* exist and happens to be blank here
	 * is left alone — hiding is exactly what it was asked to do, and the card
	 * has to show what it will print.
	 */
	const unsourced = (box: Box): boolean => {
		if (dataless) return true;
		// An area holding its own words draws from nothing that varies: empty
		// here, it is empty on every card, and hiding it only made it the one
		// area that could not be clicked to type into.
		if (!box.slot) return true;
		if (!row) return false;
		const column = mapping[box.slot];
		return !column || !(column in row);
	};

	/**
	 * An area's name, drawn in it while it has nothing of its own to draw — in
	 * its own face and size, so it shows how big what lands in it will be, and
	 * in the accent, so it cannot be taken for content.
	 *
	 * Part of the bounds: it is screen furniture of the same kind, and turning
	 * the bounds off to see the card as it prints has to take this with them.
	 * The editor's doing only: `interactive` is false in every renderer that
	 * reaches paper, a lightbox or a PNG, so a placeholder cannot be printed.
	 *
	 * An area set to hide when empty is not given one on a row that has its
	 * column — it is hidden there, which is what that row prints — only where
	 * it has nothing to draw from at all; see `unsourced`.
	 */
	const placeholderFor = (box: Box): string =>
		interactive && bounds && isEmpty(box) && (!box.hideWhenEmpty || unsourced(box))
			? // An area with no words of its own that takes a color from the row
				// is a swatch: `#`, a color's own first character, says so — and
				// keeps one that this row leaves unfilled from vanishing.
				(!box.slot && linksColor(box) ? '#' : '') ||
				// The column a bound area draws from, since that is what will be in
				// it — the area's own name is often a generic word like "field".
				// An unbound one says what it is waiting for.
				(box.slot && mapping[box.slot]) ||
				box.slot ||
				// Its own words, where they are a placeholder that came back empty
				// on this row: `%%link%%` says what will be here, which "Area" did
				// not — and shows the template to someone who has to fix it.
				(!box.slot && box.static?.text?.includes('%%') ? box.static.text.trim() : '') ||
				(pictureKind(box) ? 'Image' : 'Area')
			: '';

	/** Any of an area's colors taken from a column; see `Box.colorFrom`. */
	const linksColor = (box: Box) => !!(box.colorFrom?.text || box.colorFrom?.fill || box.colorFrom?.border);

	/** The row fills this area: something drawn, even with no words in it. */
	const filledByRow = (box: Box) => !!(row && box.colorFrom?.fill && parseColor(row[box.colorFrom.fill]));

	/**
	 * An area that hides when empty stays put where it has nothing to draw from
	 * at all, in the editor — collapsed, it could not be clicked, selected or
	 * moved, and it would be empty on every card there is. Bounds or no bounds.
	 */
	const hidden = $derived(
		new Set(
			template.boxes
				.filter((b) => b.hideWhenEmpty && isEmpty(b) && !filledByRow(b) && !(interactive && unsourced(b)))
				.map((b) => b.id)
		)
	);
	const layout = $derived(resolveLayout({ boxes: template.boxes, measured, hidden }));

	const bleed = $derived(bleedFor(template.bleed));
	const customCss = $derived(scopeCss(template.css ?? '', '.trim'));

	const VALIGN_TO_FLEX = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

	/**
	 * Paper color is the ground and the image sits on it, both covering the
	 * bleed as well as the trim — a background that stopped at the trim edge
	 * would show a white rim on everything printed with bleed.
	 */
	function cardStyle(): string {
		return [
			`width:${template.page.w + bleed * 2}mm`,
			`height:${template.page.h + bleed * 2}mm`,
			// The bleed is padding: the page keeps its own millimetres and the paper
			// to be trimmed off sits outside them.
			`padding:${bleed}mm`,
			// Handles live inside the scaled card, so a 14px handle is nine pixels
			// under the finger at 62%. Everything screen-only is sized against this
			// so a target stays the size it was drawn at, whatever the zoom.
			`--ui-scale:${1 / (scale || 1)}`,
			// One weight for every screen-only line on the card, drawn against the
			// zoom so a bound, a guide and a badge border are the same thickness at
			// 50% as at 200%. The grid is set in PagePreview, outside the transform,
			// and is deliberately finer than this.
			`--line:${1 / (scale || 1)}px`,
			`--line-thick:${1.5 / (scale || 1)}px`,
			// The page's numbers, for the template's CSS to read — csskit.ts.
			...cardVars(template).map(([name, value]) => `${name}:${value}`),
			`background-color:${template.page.background ?? '#ffffff'}`,
			...backgroundStyle(template.page.image, background)
		].join(';');
	}

	function measure(node: HTMLElement, id: string) {
		const read = () => {
			const mm = pxToMm(node.offsetHeight);
			if (Math.abs((measured[id] ?? 0) - mm) > 0.01) measured = { ...measured, [id]: mm };
			// What the box was *given* against what its content actually needs. The
			// content is measured through its own wrapper, not through the box:
			// handles and badges are absolutely positioned children that stick out
			// past the edge, and they would otherwise read as overflow on every box
			// the moment it was selected.
			//
			// Only a clipped box can cut anything off. A growing one is a
			// min-height, so it is always as tall as its lines — but a face whose
			// ascent and descent outrun a tight line height (Patrick Hand at 1.1)
			// hangs its last line's inline box a few pixels past them, and
			// scrollHeight counts that, which flagged every two-line title as cut.
			const content = node.querySelector<HTMLElement>('.content');
			// Shrink cuts too, once its words are as small as it will set them —
			// but whether words of a Shrink area are cut is `fitWords`'s to say:
			// it measures the room inside the padding and the width as well,
			// and two judges writing one flag in turn made the warning flicker.
			const box = template.boxes.find((b) => b.id === id);
			if (box?.overflow === 'shrink' && (box.mode === 'plain' || box.mode === 'markdown')) return;
			const clipped = box?.overflow === 'clip' || box?.overflow === 'shrink';
			const spills = clipped && !!content && content.scrollHeight > node.clientHeight + 1;
			if ((overflowing[id] ?? false) !== spills) overflowing = { ...overflowing, [id]: spills };
		};
		read();
		const observer = new ResizeObserver(read);
		observer.observe(node);
		// A clipped box is a fixed height, so nothing it contains can ever change
		// its size and the resize observer above never fires for it — which is why
		// the overflow warning used to appear on growing boxes and never on the
		// clipped ones it matters most for. Content changes are a mutation, not a
		// resize, so they need watching as such. Cheap: it fires on an actual DOM
		// change, and read() only writes state when a number actually moved, so
		// the re-render it can cause settles on the next pass.
		const mutations = new MutationObserver(read);
		mutations.observe(node, { subtree: true, childList: true, characterData: true });
		// Web fonts land after first paint and change every height on the card.
		if (typeof document !== 'undefined' && document.fonts) document.fonts.ready.then(read).catch(() => {});
		return {
			update: read,
			destroy: () => {
				observer.disconnect();
				mutations.disconnect();
			}
		};
	}

	/**
	 * Shrink: the words set as large as they can be and still fit the area, both
	 * ways — a word too long for the width counts as much as a line too many.
	 * Tried on the element itself, a bisection of layouts (`shrinkScale`), and
	 * then kept in `shrunk`, so the style the card renders says the same thing
	 * the search left behind and the next render does not undo it. Every size in
	 * the area is in em of it — Markdown's headings included — so one font size
	 * on `.content` scales the lot; padding, borders and the letter-spacing,
	 * which are millimetres, stay as set.
	 *
	 * Run again whenever what the area holds or how it is set changes: its
	 * text (a mutation), its width (a resize), its style (font, size — an
	 * attribute change), and a web font landing. The search's own writes are
	 * attribute changes as well, and are thrown away when it finishes.
	 */
	function fitWords(node: HTMLElement, id: string | null) {
		let current = id;
		/** What the last search was for: the same words in the same room in the same type fit the same. */
		let searched = '';
		const read = () => {
			if (!current) return;
			const content = node.querySelector<HTMLElement>(':scope > .content');
			if (!content) return;
			// Against the room the area has inside its padding, not `.content`'s
			// own height: that is only as tall as the words when they are short,
			// and a face whose last line hangs a few pixels past its line box
			// would never fit in it at any size.
			const pad = getComputedStyle(node);
			const room = node.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
			// The area's style holds its position too, so a drag or a nudge
			// changes it every frame without changing what fits; selecting it
			// changes its class. Only a change to the words, the room or the
			// type is worth a search's dozen forced layouts.
			// The words as text and the count of what they are set in: a change to
			// either is a change to the words. Not the markup itself — reading it
			// is a sink the gates refuse, and its text says the same.
			const key = [current, room, node.clientWidth, pad.font, pad.letterSpacing, content.textContent, content.getElementsByTagName('*').length].join('|');
			if (key === searched) {
				words.takeRecords();
				return;
			}
			searched = key;
			const fits = (scale: number) => {
				content.style.fontSize = `${scale}em`;
				return content.scrollHeight <= room + 1 && content.scrollWidth <= content.clientWidth + 1;
			};
			const scale = shrinkScale(fits);
			content.style.fontSize = scale === 1 ? '' : `${scale}em`;
			// Said again here, as `measure` says it: that one read the words before
			// they were set smaller, and setting them smaller is no change it
			// watches for. Only at the floor can they still be cut.
			const spills = content.scrollHeight > room + 1 || content.scrollWidth > content.clientWidth + 1;
			if ((overflowing[current] ?? false) !== spills) overflowing = { ...overflowing, [current]: spills };
			if ((shrunk[current] ?? 1) !== scale) {
				const { [current]: _was, ...rest } = shrunk;
				shrunk = scale === 1 ? rest : { ...rest, [current]: scale };
			}
			// The search's own writes to `.content` are mutations too; read
			// again for them and it would never stop.
			words.takeRecords();
		};
		const resize = new ResizeObserver(read);
		const words = new MutationObserver(read);
		const watch = () => {
			resize.disconnect();
			words.disconnect();
			if (!current) return;
			resize.observe(node);
			// One call: a second `observe` on the same node replaces the first's
			// options rather than adding to them.
			words.observe(node, {
				subtree: true,
				childList: true,
				characterData: true,
				attributes: true,
				attributeFilter: ['style', 'class']
			});
			read();
		};
		watch();
		if (typeof document !== 'undefined' && document.fonts) document.fonts.ready.then(read).catch(() => {});
		return {
			update: (next: string | null) => {
				// Switched off and on again, nothing in the key has changed, but
				// the scale was dropped: search afresh rather than skip.
				searched = '';
				if (current && !next) {
					const was = current;
					if (shrunk[was] !== undefined) {
						const { [was]: _gone, ...rest } = shrunk;
						shrunk = rest;
					}
					// Switched to Clip or Grow: the words are full size again, and
					// whether they are now cut is `measure`'s to say — but nothing it
					// watches has changed, so it would not say it until the next
					// edit. Asked here once the full size has been drawn.
					requestAnimationFrame(() => {
						const content = node.querySelector<HTMLElement>(':scope > .content');
						const clipped = template.boxes.find((b) => b.id === was)?.overflow === 'clip';
						const spills = clipped && !!content && content.scrollHeight > node.clientHeight + 1;
						if ((overflowing[was] ?? false) !== spills) overflowing = { ...overflowing, [was]: spills };
					});
				}
				current = next;
				watch();
			},
			destroy: () => {
				resize.disconnect();
				words.disconnect();
			}
		};
	}

	/**
	 * Whether this card is a left-hand page. Everything about facing pages hangs
	 * off the page number the card was handed, so the editor shows the fold as
	 * it pages through the rows without being told about it separately.
	 */
	const verso = $derived(template.facing === true && pageSide(pageNumber) === 'verso');

	/**
	 * A box where it is drawn, which on a left-hand page is its mirror. The
	 * template still stores the right-hand page, so this is the only place the
	 * two frames differ — and the drag below undoes it again before writing
	 * anything back.
	 */
	const placed = (box: Box): Box => (verso && mirrors(box) ? mirrorBox(box, template.page.w) : box);

	/**
	 * Where this page falls in the run, as an id and classes a template's CSS
	 * can style: the covers by place — first, last, and the two inside them,
	 * once there are enough pages for an inside — and, with facing pages, the
	 * side of the fold. Nothing without a page number: the editor with no rows
	 * is not a page of anything.
	 */
	const pageHooks = $derived.by(() => {
		const look = `theme-${theme}`;
		if (pageNumber == null) return { id: undefined, place: undefined, classes: look };
		const n = pageNumber;
		const last = pageCount ?? 0;
		// A page's place in the run is an id: there is only one of each, and at
		// most one per page. On a wrapper of its own inside the page's, since an
		// element has one id and `#page-N` already has it.
		const place =
			n === 1
				? 'cover'
				: last > 1 && n === last
					? 'back-cover'
					: last >= 4 && n === 2
						? 'inside-cover'
						: last >= 4 && n === last - 1
							? 'inside-back-cover'
							: undefined;
		const classes = [template.facing === true && (verso ? 'verso' : 'recto'), look].filter(Boolean);
		// An area that already wears one of these ids — named before the names
		// were refused (`isPageId`) — keeps it, and the page goes without.
		const taken = new Set(template.boxes.map((b) => cssIdent(b.slot ?? '')).filter(isPageId));
		const free = (id: string | undefined) => (id && !taken.has(id) ? id : undefined);
		return { id: free(`page-${n}`), place: free(place), classes: classes.join(' ') };
	});

	/**
	 * Words in columns: the browser's own multi-column layout, on the content
	 * rather than the box, so the box's padding, border and fill stay one
	 * frame round all of them. Balanced: a fixed height cuts what overflows
	 * as it cuts a single column, and a growing area grows to the longest.
	 * Words only — a picture or a QR code in columns is a stretched picture.
	 */
	const inColumns = (box: Box) => !!box.columns && (box.mode === 'plain' || box.mode === 'markdown');
	// Orphans and widows: how many of a paragraph's lines are kept together
	// where a column breaks it. Not Baseline — Firefox has never had them —
	// and taken knowingly (AGENTS.md): where they are not read the columns
	// still flow, only without the rule.
	const columnsStyle = (box: Box): string | undefined =>
		inColumns(box)
			? `column-count:${box.columns!.count};column-gap:${box.columns!.gap}mm;orphans:${box.columns!.orphans ?? DEFAULT_ORPHANS};widows:${box.columns!.widows ?? DEFAULT_WIDOWS}`
			: undefined;

	/**
	 * The side of an area that faces the fold, for an area that follows it:
	 * that edge is drawn as a fold line, dot and dash, so which areas mirror reads
	 * off the page without opening the bar. Left on a right-hand page, right on
	 * a left-hand one.
	 */
	/**
	 * The gaps between an area's columns, as fractions of the width its words
	 * have — the area less its borders and its padding, which is what the
	 * columns divide (see `columnsStyle`). Empty where the words are not in
	 * columns. Drawn as a dotted line each side of each gap, so the gutters
	 * read off the page while the bounds are shown or the area is chosen.
	 */
	const gapsOf = (box: Box): Array<[number, number]> => {
		if (!inColumns(box)) return [];
		const pad = sidesOf(box.padding ?? 0);
		const border = sidesOf(box.borderWidth ?? 0);
		return columnGaps(box.columns!.count, box.columns!.gap, box.w - pad.left - pad.right - border.left - border.right);
	};

	const foldSide = (box: Box): 'left' | 'right' | null =>
		template.facing === true && mirrors(box) ? (verso ? 'right' : 'left') : null;

	/**
	 * What an area paints under its content — the fill, a fill out of the data,
	 * a tiled picture, and the border — on a layer of its own over the box's
	 * border box. It used to be the box's own background and border, which put
	 * it on the one element whose opacity also fades everything hung off it;
	 * on its own layer it takes the area's opacity alone. The box keeps the
	 * border's room, transparent, so nothing measures differently.
	 */
	function surfaceStyle(box: Box): string {
		const parts: string[] = [];
		if (box.background) parts.push(`background:${box.background}`);
		// On a stamp the fill is the field printed on the paper, not the paper:
		// inside the padding, which is the stamp's margin. Spread to the border
		// box it would fill the perforations back in, and a drop-shadow would
		// trace the rectangle rather than the holes.
		if (stamped(box)) {
			const pad = sidesOf(box.padding ?? 0);
			parts.push(`top:${pad.top}mm`, `right:${pad.right}mm`, `bottom:${pad.bottom}mm`, `left:${pad.left}mm`);
		}
		// A color out of the data fills the area itself, not a panel inside it, so
		// it reaches under the padding and takes the corner radius with it. After
		// the declared fill, because the row is the more specific answer.
		if (shownAsMedia(box.mode)) {
			const media = mediaOf(box);
			if (media.color) parts.push(`background:${media.color}`);
			// A tile is a background, not an element: `<img>` has no way to repeat.
			else if (media.src && box.fit === 'repeat') {
				parts.push(
					`background-image:${cssUrl(tiles[media.src] ?? media.src)}`,
					'background-repeat:repeat',
					'background-size:auto',
					// From inside the border, as the box's own background was: the
					// surface spans the border box, the tile starts at the padding.
					'background-origin:padding-box'
				);
				// A tiled drawing is drawn hard for the same reason a fitted one
				// is — see `drawnByHand`.
				if (drawnByHand(media.src)) parts.push('image-rendering:pixelated');
			}
		}
		if (box.borderWidth && !drawnBorder(box)) {
			const { top, right, bottom, left } = sidesOf(box.borderWidth);
			parts.push(
				`border-width:${top}mm ${right}mm ${bottom}mm ${left}mm`,
				`border-style:${box.borderStyle ?? 'solid'}`,
				`border-color:${borderColorOf(box)}`
			);
		}
		if (box.borderRadius) parts.push(`border-radius:${box.borderRadius}mm`);
		return parts.join(';');
	}

	function boxStyle(box: Box): string {
		const drawn = placed(box);
		const align = drawn.align ?? template.defaults.align;
		const parts = [
			`left:${drawn.x}mm`,
			`top:${layout.tops[box.id] ?? box.y}mm`,
			`width:${box.w}mm`,
			`font-family:${fontStack(box.font ?? template.defaults.font, template.defaults.font)}`,
			`font-size:${box.size ?? template.defaults.size}pt`,
			`font-weight:${box.weight ?? template.defaults.weight}`,
			`line-height:${box.lineHeight ?? template.defaults.lineHeight}`,
			`color:${box.color ?? template.defaults.color}`,
			`text-align:${align}`,
			// Vertical placement needs the box to be a flex column. That stops the
			// first child's top margin collapsing out of the box, which the
			// `:first-child { margin-top: 0 }` rules below already neutralise; the
			// box's own offsetHeight is unchanged, so anchoring still measures right.
			`justify-content:${VALIGN_TO_FLEX[box.valign ?? 'top']}`
		];
		// Justified text without hyphenation opens rivers; the card is `lang="en"`
		// so the browser has a dictionary to break with.
		if (align === 'justify') parts.push('hyphens:auto');
		const letterSpacing = box.letterSpacing ?? template.defaults.letterSpacing;
		if (letterSpacing) parts.push(`letter-spacing:${letterSpacing}mm`);
		if (box.italic) parts.push('font-style:italic');
		if (box.textCase === 'uppercase') parts.push('text-transform:uppercase');
		if (box.textCase === 'smallcaps') parts.push('font-variant-caps:small-caps');
		// In points, worked out here: a custom property holding `em` resolves at
		// each element that uses it, so a heading twice the size would have
		// moved twice as far as the paragraph under it.
		const baseline = baselineOf(box, template.defaults);
		if (baseline) parts.push(`--baseline:${Math.round(-baseline * (box.size ?? template.defaults.size) * 1000) / 1000}pt`);
		// Emitted whether or not there is any, because the selected-box padding
		// guide reads these back and a missing custom property would fall to 0 and
		// draw the guide exactly on top of the bounds.
		const pad = sidesOf(box.padding ?? 0);
		parts.push(
			`--pad-t:${pad.top}mm`,
			`--pad-r:${pad.right}mm`,
			`--pad-b:${pad.bottom}mm`,
			`--pad-l:${pad.left}mm`
		);
		if (box.padding) {
			parts.push(`padding:${pad.top}mm ${pad.right}mm ${pad.bottom}mm ${pad.left}mm`);
		}
		// `.area` is border-box, so a border eats into the width rather than adding
		// to it: the box still occupies exactly the millimetres it was given.
		if (box.borderWidth) {
			const { top, right, bottom, left } = sidesOf(box.borderWidth);
			parts.push(
				`border-width:${top}mm ${right}mm ${bottom}mm ${left}mm`,
				// A hand-drawn border still keeps the room a CSS one would take —
				// solid, and painted in nothing — so switching it on moves no text
				// and changes no measurement. Only what is drawn in that room
				// changes, and the SVG below draws it.
				// Always solid and clear here: the room is the box's, the paint is
				// the surface's — see `surfaceStyle`.
				'border-style:solid',
				'border-color:transparent',
				`--bw-t:${top}mm`,
				`--bw-r:${right}mm`,
				`--bw-b:${bottom}mm`,
				`--bw-l:${left}mm`
			);
		}
		if (box.borderRadius) parts.push(`border-radius:${box.borderRadius}mm`);
		// One of thirteen words, checked on the way into the template — see
		// `newBox`. Blending reaches the paper and whatever is stacked under this
		// area, and stops at the card: the scaler above it is a transform, and a
		// transform is a stacking context.
		if (box.blend) parts.push(`mix-blend-mode:${box.blend}`);
		// Opacity is not here: on the box it faded the handles, the badges and the
		// selection with it. It is a custom property the painted parts read —
		// the surface, a hand-drawn border and the content — and nothing else.
		if (box.opacity !== undefined) parts.push(`--ink:${box.opacity}`);
		// A CSS transform does not touch layout, so a rotated box still reports the
		// height it would have had upright — which is what `measure()` reads and
		// what anchored boxes below follow. That is the intended bargain: turning a
		// box does not shove the rest of the card around. Snapping sees the upright
		// rectangle too.
		// As drawn: on a facing page a quarter turn is the opposite one, about
		// the mirrored pivot — see `mirrorBox`.
		if (drawn.rotation) {
			const centre = drawn.centre ?? { x: 50, y: 50 };
			parts.push(`transform:rotate(${drawn.rotation}deg)`, `transform-origin:${centre.x}% ${centre.y}%`);
		}
		if (hidden.has(box.id)) {
			parts.push('height:0', 'overflow:hidden', 'visibility:hidden');
		} else if (box.overflow === 'clip' || box.overflow === 'shrink') {
			// The height only. The clip itself is CSS, on .content — put here, on
			// the box, it also ate the handles and badges that hang off its edges.
			parts.push(`height:${box.h}mm`);
		} else {
			parts.push(`min-height:${box.h}mm`);
		}
		return parts.join(';');
	}

/**
	 * Whether a picture should be drawn hard rather than smoothed.
	 *
	 * A drawing made here is the only thing that arrives as `data:` — the
	 * surface writes a base64 PNG straight into the cell — and it is 64 pixels
	 * on its longest side on purpose. Blown up to a centimetre or ten, a browser
	 * would interpolate it into a smudge, which is not what was drawn. A
	 * photograph comes from a folder or an address and keeps its smoothing.
	 *
	 * The honest edge of this: a cell someone pastes a base64 *photograph* into
	 * is drawn hard as well. It is the same trade a name like `local:` avoids
	 * and a data URL cannot — nothing in the bytes says which of the two it is.
	 */
	const drawnByHand = (src: string | undefined) => !!src?.startsWith('data:');

	/**
	 * What a tiled area actually repeats: the drawing trimmed to its ink — see
	 * `tile.ts`. Worked out from the pixels, so it cannot be done while building
	 * a style string; the map fills in as the crops resolve and the style is
	 * rebuilt then, tiling the whole board in the meantime.
	 */
	let tiles = $state<Record<string, string>>({});

	$effect(() => {
		for (const box of template.boxes) {
			if (!takesADrawing(box.mode) || box.fit !== 'repeat') continue;
			const src = mediaOf(box).src;
			if (!croppable(src) || tiles[src]) continue;
			const held = tileOf(src);
			if (held) {
				tiles = { ...tiles, [src]: held };
				continue;
			}
			cropToInk(src).then((cropped) => {
				if (cropped) tiles = { ...tiles, [src]: cropped };
			});
		}
	});

	const borderColorOf = (box: Box) => box.borderColor ?? box.color ?? template.defaults.color;

	/** A stamp, which no CSS border can draw: its perforations are always SVG. */
	const stamped = (box: Box) => !!box.borderWidth && box.borderStyle === 'stamp';
	/** A border the SVG layer draws rather than CSS — by hand, or a stamp. */
	const drawnBorder = (box: Box) => !!box.borderWidth && (!!box.borderHand || stamped(box));

	/**
	 * The strokes of a hand-drawn border, in the millimetres of the box's own
	 * border box — its declared width, and the height the layout resolved, which
	 * is the same number `measure` read off the element.
	 *
	 * Seeded with the box id, so the wobble is the same on every page of the run
	 * and does not redraw itself as the words underneath it are typed.
	 */
	function handStrokes(box: Box): HandStroke[] {
		if (!drawnBorder(box)) return [];
		return handBorder({
			w: box.w,
			h: layout.heights[box.id] ?? box.h,
			widths: sidesOf(box.borderWidth),
			radius: box.borderRadius ?? 0,
			style: box.borderStyle ?? 'solid',
			seed: box.id,
			steady: !box.borderHand
		});
	}
	/**
	 * The area's name, as the `id` its element wears.
	 *
	 * This is what makes `#Job-Title { … }` in a template's own CSS reach one
	 * named area — the whole reason an area has a name you can type. Spread as
	 * an object rather than written as `id={…}`, because an unnamed area must
	 * carry no `id` attribute at all rather than an empty one.
	 *
	 * The trade-off, said out loud: a sheet of several cards renders the same
	 * design several times, so the same id appears once per card on it. CSS is
	 * fine with that — an id selector matches every element wearing it, which is
	 * exactly what styling "this area on every card" needs — but a validator is
	 * not, and `getElementById` answers with the first. Nothing in the app looks
	 * an area up that way: `data-box-id` is what the editor addresses, and it
	 * stays unique because it is generated.
	 *
	 * Renaming cannot make two areas share a name — `BoxOptions.setSlot` refuses
	 * it — but duplicating one still can, deliberately: a copy that kept the name
	 * kept the binding with it, and a template that styles `#Job-Title` means
	 * both of them.
	 */
	/*
	 * Besides the id, every area carries two classes a template's CSS can
	 * reach: where its content comes from — `content-field`, `content-static`
	 * or `content-image`, the three the bar's Content offers — and its mode,
	 * `mode-plain`, `mode-markdown`, `mode-image`, `mode-color` or `mode-qr`.
	 * Prefixed, because a bare `.plain` or `.image` would collide with the
	 * card's own classes inside the area. They are on paper as on screen:
	 * one layout engine, one set of hooks.
	 */
	const idFor = (box: Box) => {
		const ident = cssIdent(box.slot ?? '');
		return ident ? { id: ident } : {};
	};

	/** The page number rides on the template's own defaults, never on a box's. */
	function pageNumberStyle(): string {
		const { margin } = template.pageNumber;
		// Outer and inner are the whole reason a page number knows about the
		// fold: resolved here to the edge this page actually has. Without facing
		// pages there are only right-hand pages, so outer is the right edge.
		const position = facingPosition(template.pageNumber.position, verso ? 'verso' : 'recto');
		const [vertical, horizontal] = position.split('-');
		const parts = [
			vertical === 'top' ? `top:${margin}mm` : `bottom:${margin}mm`,
			`font-family:${fontStack(template.defaults.font, template.defaults.font)}`,
			`font-size:${template.defaults.size}pt`,
			`font-weight:${template.defaults.weight}`,
			`color:${template.defaults.color}`,
			`line-height:1`
		];
		if (horizontal === 'left') parts.push(`left:${margin}mm`, 'text-align:left');
		else if (horizontal === 'right') parts.push(`right:${margin}mm`, 'text-align:right');
		else parts.push(`left:${margin}mm`, `right:${margin}mm`, 'text-align:center');
		return parts.join(';');
	}

	/** Inline SVG is a template author's own markup, but never let it carry script. */
	const safeSvg = (svg: string) =>
		svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

	// ---- direct manipulation -------------------------------------------------

	type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'centre' | 'rotate';
	/** A Shift+click on a chosen area, held back until it is known not to be a drag. */
	let pendingToggle: string | null = null;

	let drag: {
		id: string;
		mode: DragMode;
		startX: number;
		startY: number;
		origin: Box;
		others: Box[];
		/** boxes anchored to this one: they take the x delta and nothing else */
		held: Box[];
		/** whether this drag has said what it is, which it does once it moves */
		named?: boolean;
	} | null = null;

	const editable = (box: Box) => interactive && !box.locked && !template.locked;

	// ---- an image dropped on an area ------------------------------------------

	/** The area a file is being held over, so the drop has somewhere to land. */
	let dropId = $state<string | null>(null);

	/** The first image among what is being dragged, before it can be read. */
	const draggingImage = (event: DragEvent) =>
		Array.from(event.dataTransfer?.items ?? []).some(
			(item) => item.kind === 'file' && item.type.startsWith('image/')
		);

	function dragOver(event: DragEvent, box: Box) {
		if (!onimagedrop || !editable(box) || !draggingImage(event)) return;
		// Without this the browser takes the drop itself and navigates to the
		// file, which leaves the design behind.
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		dropId = box.id;
	}

	function drop(event: DragEvent, box: Box) {
		if (!onimagedrop || !editable(box)) return;
		const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
		dropId = null;
		if (!file) return;
		event.preventDefault();
		event.stopPropagation();
		onimagedrop(box, file);
	}
	const isSelected = (box: Box) => selectedIds.includes(box.id);
	/** Handles belong to a single box: with several chosen, the bar does the work. */
	const soleSelection = $derived(selectedIds.length === 1);

	/** The eight handles, as against moving, turning and the pivot. */
	const RESIZE_MODES = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

	/**
	 * A finger, rather than a mouse — the handles' reach is wider for one, so
	 * how short an area has to be before its marks collide depends on it.
	 */
	let coarse = $state(false);

	$effect(() => {
		const query = window.matchMedia('(pointer: coarse)');
		const sync = () => (coarse = query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});

	/**
	 * Too short, on screen, for the pivot to sit clear of the top and bottom
	 * handles: the reach of the N and S handles and the pivot's own reach
	 * overlap across the whole height. There the resize handles win — see the
	 * `.cramped` rule. In screen pixels, from the same numbers as the CSS: a
	 * handle's half-mark plus reach, and the pivot's, each side of the middle.
	 */
	const cramped = (box: Box): boolean => {
		const heightPx = mmToPx(layout.heights[box.id] ?? box.h) * scale;
		const clearance = coarse ? 5 + 19 + 5.5 + 20 : 7 + 8 + 7.5 + 8;
		return heightPx < clearance * 2;
	};

	/**
	 * A second tap on the same area, soon enough, opens it for typing.
	 *
	 * `dblclick` covers a mouse and does not cover a finger: the box is
	 * `touch-action: none` so it can be dragged, and a browser will not
	 * synthesise a double-click out of taps it has been told not to interpret.
	 * So the pair is counted here, for touch only — a mouse still comes through
	 * `ondblclick`, which is the event it actually fires.
	 */
	const DOUBLE_TAP = 350;
	let lastTap: { id: string; at: number } | null = null;

	/**
	 * Every finger currently down, anywhere.
	 *
	 * Two of them are a pinch — the page's zoom, or the type size of the area
	 * under them — and a pinch must not also drag whatever the first finger
	 * happened to land on: a two-finger gesture over an area would otherwise
	 * scale the type and walk the area across the card at the same time. The
	 * listeners are on the window and in the capture phase, because a box stops
	 * its own pointerdown from propagating and the second finger may land
	 * anywhere at all — on another area, on the paper, or off the card.
	 */
	let touching = new Set<number>();

	$effect(() => {
		if (!interactive) return;
		const down = (event: PointerEvent) => {
			if (event.pointerType !== 'touch') return;
			touching.add(event.pointerId);
			if (touching.size > 1) abandonDrag();
		};
		const up = (event: PointerEvent) => touching.delete(event.pointerId);
		window.addEventListener('pointerdown', down, true);
		window.addEventListener('pointerup', up, true);
		window.addEventListener('pointercancel', up, true);
		return () => {
			window.removeEventListener('pointerdown', down, true);
			window.removeEventListener('pointerup', up, true);
			window.removeEventListener('pointercancel', up, true);
			touching.clear();
		};
	});

	/**
	 * Give up on a drag and put back what it had already moved.
	 *
	 * Not the same as letting go: this is the drag being called off by something
	 * else — a second finger — so the area goes back where it was rather than
	 * staying wherever the first finger had got it to. Only when it had actually
	 * moved something, so a pinch that begins with one finger resting on an area
	 * writes nothing at all.
	 */
	function abandonDrag() {
		if (!drag) return;
		if (drag.named) {
			onchange?.({ ...drag.origin });
			for (const box of [...drag.others, ...drag.held]) onchange?.({ ...box });
		}
		drag = null;
		guide = { x: null, y: null };
		spaced = null;
	}

	function startDrag(event: PointerEvent, box: Box, mode: DragMode) {
		// Only the primary button drags. Without this a right-click starts one,
		// and its non-additive select collapses a multi-selection to one box
		// before the context menu it opened has a chance to act on the rest.
		if (event.button !== 0 || !interactive) return;
		// A second finger is a pinch, not a second drag — and not a selection
		// either: the area under it is not being picked, it is being pinched.
		if (event.pointerType === 'touch' && touching.size > 1) return;
		// Zoom and pan: a press on the area itself is left to the page, which
		// scrolls under it — nothing prevented, nothing captured — and is only
		// a choice if it comes back up where it went down (`endDrag`). The
		// handles and the lever are not the area, and still drag.
		if (panning && mode === 'move') {
			panTap = {
				id: box.id,
				pointer: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				additive: event.shiftKey || event.metaKey || event.ctrlKey,
				touch: event.pointerType === 'touch'
			};
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (event.pointerType === 'touch' && mode === 'move') {
			const now = event.timeStamp || Date.now();
			if (lastTap && lastTap.id === box.id && now - lastTap.at < DOUBLE_TAP) {
				lastTap = null;
				onselect?.(box.id, false);
				beginEdit(box);
				return;
			}
			lastTap = { id: box.id, at: now };
		}
		// Selecting comes first and is never refused: a lock stops a box moving,
		// not being picked — otherwise the only control that could unlock it
		// could never be reached.
		// Only a press on the area itself adds to a selection. The handles, the
		// lever and the pivot exist only on a sole selection, and Shift on them
		// is a modifier of their own — resizing from the aligned edge, turning
		// in 15° steps — which used to toggle the area out of the selection on
		// the same press.
		const additive = mode === 'move' && (event.shiftKey || event.metaKey || event.ctrlKey);
		// Shift on an area already chosen is either Shift+click — take it out of
		// the selection — or Shift+drag, which moves on a straight line. Which
		// one is not known until the pointer moves, so the toggle waits for the
		// release (`endDrag`) and happens only if it did not.
		if (additive && event.shiftKey && isSelected(box) && editable(box)) pendingToggle = box.id;
		else onselect?.(box.id, additive);
		if (!editable(box)) return;
		// Snapshotted at the start: moving several boxes applies one delta to
		// each of these, so a box cannot drift by accumulating rounding.
		const others =
			mode === 'move' && selectedIds.length > 1
				? template.boxes.filter((b) => b.id !== box.id && selectedIds.includes(b.id) && !b.locked).map((b) => ({ ...b }))
				: [];
		// Anchored boxes already follow the moving ones downwards — resolveLayout
		// takes their top from its bottom — so they only need the sideways half
		// of the move. Applying the vertical delta as well would move them twice.
		// Those of every box moving, not only the one under the pointer, or a
		// chain hanging off another chosen area was left behind sideways.
		const held = new Map<string, Box>();
		if (mode === 'move') {
			for (const mover of [box, ...others]) {
				for (const b of dependentsOf(mover.id)) {
					if (!b.locked && !selectedIds.includes(b.id) && b.id !== box.id) held.set(b.id, { ...b });
				}
			}
		}
		drag = {
			id: box.id,
			mode,
			startX: event.clientX,
			startY: event.clientY,
			origin: { ...box },
			others,
			held: [...held.values()]
		};
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	/**
	 * Snapping, strongest first: the page margins when they are drawn, then the
	 * temporary guides — another box's edges and middle, and the page's centre
	 * lines, within `SNAP_TOLERANCE` — then an enabled grid. A box being moved
	 * tries its left, middle and right (top, middle, bottom) and takes whichever
	 * is nearest, so boxes line up by their middles as well as their edges; a
	 * handle, which moves one edge, tries that edge. Sibling edges come from the
	 * resolved layout, so a box snaps to where a grown box really ends. An
	 * alignment in reach beats the grid, because it is the more specific thing
	 * to have meant.
	 *
	 * There is no modifier to hold: the toggles under the page are the whole
	 * control. Grid and Guides both off is free movement; every latch draws the
	 * line it caught, because a snap to an invisible edge is indistinguishable
	 * from a bug.
	 */
	const SNAP_TOLERANCE = 1.5;

	/**
	 * The page margins, as stored — the right-hand page's frame, which is the
	 * frame every drag is worked in — and as drawn, which on a left-hand page
	 * swaps the inner and outer edges over.
	 */
	const margins = $derived(marginsOf(template.page));
	const drawnMargins = $derived(
		verso ? { ...margins, left: margins.right, right: margins.left } : margins
	);

	/** Whether a drag on this box is happening against its mirror image. */
	const mirroredDrag = (box: Box) => verso && mirrors(box);

	/** The handle a mirrored box's opposite edge answers to. */
	const MIRRORED_MODE: Record<DragMode, DragMode> = {
		move: 'move',
		n: 'n',
		s: 's',
		e: 'w',
		w: 'e',
		ne: 'nw',
		nw: 'ne',
		se: 'sw',
		sw: 'se',
		centre: 'centre',
		rotate: 'rotate'
	};

	function moveDrag(event: PointerEvent) {
		if (!drag) return;
		const edges = smartGuides ? boxEdges(template.boxes, layout, drag.id) : { x: [], y: [] };
		// The page's own centre lines too: a box centred on the card is the
		// alignment most cards want, and there may be no box there to line up with.
		if (smartGuides) {
			edges.x.push(template.page.w / 2);
			edges.y.push(template.page.h / 2);
		}
		const latched = { x: null as number | null, y: null as number | null };

		// With the guides on, the margins win over a grid line or a sibling's
		// edge within reach: a page whose margin is not a whole number of grid
		// steps would otherwise have an edge nothing could be placed against.
		const marginEdges = {
			x: [margins.left, template.page.w - margins.right],
			y: [margins.top, template.page.h - margins.bottom]
		};
		/** `length` is the box's extent on this axis when the whole box is moving. */
		const place = (value: number, axis: 'x' | 'y', length?: number): number => {
			if (guides) {
				const hit = snapToEdges(value, marginEdges[axis], SNAP_TOLERANCE);
				if (hit !== null) {
					latched[axis] = hit;
					return hit;
				}
			}
			if (length !== undefined) {
				const hit = latchSpan(value, length, edges[axis], SNAP_TOLERANCE);
				if (hit) {
					latched[axis] = hit.edge;
					return round2(hit.start);
				}
			} else {
				const hit = snapToEdges(value, edges[axis], SNAP_TOLERANCE);
				if (hit !== null) {
					latched[axis] = hit;
					return hit;
				}
			}
			return snapTo(value, grid ? GRID_MINOR : FREE_STEP);
		};
		// A size is not a position: it rounds, but it never latches onto an edge.
		const size = (value: number) => snapTo(value, grid ? GRID_MINOR : FREE_STEP);

		// Named on the first movement rather than at pointerdown, and once only.
		// Selecting a box goes through startDrag too, so naming it there labelled
		// every click "Move" — and since the first label of a burst is the one
		// that sticks, a click followed by an arrow key was recorded as a drag.
		if (!drag.named) {
			drag.named = true;
			onaction?.(DRAG_LABELS[drag.mode]);
			// Moving or sizing; a turn is about its angle, not its gaps.
			if (drag.mode !== 'rotate' && drag.mode !== 'centre') {
				spaced = { id: drag.id, with: [...drag.others, ...drag.held].map((b) => b.id) };
			}
		}
		// Past the slop, this is a drag rather than a hand that will not keep
		// still, so a menu the same press opened gets out of the way. The same
		// threshold `hold` gives up at, for the same reason: below it, nobody
		// meant to move anything.
		if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > HOLD_SLOP) onmenuclose?.();

		const origin = drag.origin;
		// The handles turn with the box, so a pointer delta arrives in screen space
		// and has to come back through the rotation before it can be read as a
		// width or a height. Moving is exempt: a translation in the parent's space
		// is the same however the box is turned, and un-rotating it would send the
		// box off at an angle to the pointer.
		const screenX = pxToMm((event.clientX - drag.startX) / scale);
		const screenY = pxToMm((event.clientY - drag.startY) / scale);
		// 'move' and 'rotate' are both exempt, for different reasons: a translation
		// in the parent's space is the same however the box is turned, and a
		// rotation is read from where the pointer *is* rather than how far it has
		// come. Every new mode lands in the un-rotating branch by default, which
		// is why this reads as a list rather than a single comparison.
		// The turn as drawn, which on a facing page may be the opposite quarter
		// turn: the handles are where it put them.
		const drawnOrigin = placed(origin);
		const turn = drag.mode === 'move' || drag.mode === 'rotate' ? 0 : ((drawnOrigin.rotation ?? 0) * Math.PI) / 180;
		const cos = Math.cos(turn);
		const sin = Math.sin(turn);
		// On a left-hand page a mirrored box is drawn at its facing position, so
		// a pointer that went right moved it *left* in the millimetres the
		// template stores, and the handle it grabbed is the opposite edge of the
		// stored box. Undoing both here keeps every case below in one frame — the
		// one the template is written in. The pivot and the rotation handle are
		// exempt: mirroring places a box, it does not flip what is inside it.
		// A quarter-turned box is the exception for the pivot: its pivot *is*
		// mirrored, so a pointer moving it right moved the stored one left.
		const flip =
			mirroredDrag(origin) &&
			drag.mode !== 'rotate' &&
			(drag.mode !== 'centre' || quarterTurn(origin.rotation));
		const dx = (screenX * cos + screenY * sin) * (flip ? -1 : 1);
		const dy = -screenX * sin + screenY * cos;
		const mode = flip ? MIRRORED_MODE[drag.mode] : drag.mode;
		const next: Box = { ...origin };

		const setTop = (deltaY: number, length?: number) => {
			// An anchored box has no independent top: move its gap instead, so the
			// relationship the template author set up survives being dragged. No
			// floor under it — dragged up past the area it follows, it overlaps
			// that area, with a negative gap, rather than stopping dead.
			if (origin.anchor) next.anchor = { ...origin.anchor, gap: size(origin.anchor.gap + deltaY) };
			else next.y = place(origin.y + deltaY, 'y', length);
		};

		switch (mode) {
			case 'rotate': {
				// The angle from the pivot to the pointer, against the angle it
				// started at, so the box does not jump when the drag begins. Both
				// are measured in the page's own space: the handle turns with the
				// box, so a delta would chase itself.
				const node = event.currentTarget as HTMLElement;
				const boxEl = node.closest('.area') as HTMLElement | null;
				const trimEl = boxEl?.offsetParent as HTMLElement | null;
				if (!boxEl || !trimEl) break;
				// Read the box's *layout* geometry, not its rendered rectangle: once
				// a box is turned, getBoundingClientRect reports the upright box that
				// contains it, and the pivot taken from that is somewhere else
				// entirely. offsetLeft and friends are measured against .trim, which
				// never turns, so they describe the box as it was placed. The pivot
				// is the transform origin, so it is the one point that does not move
				// when the rotation changes — which is what makes this valid.
				const trim = trimEl.getBoundingClientRect();
				const c = drawnOrigin.centre ?? { x: 50, y: 50 };
				const pivotX = trim.left + (boxEl.offsetLeft + (boxEl.offsetWidth * c.x) / 100) * scale;
				const pivotY = trim.top + (boxEl.offsetTop + (boxEl.offsetHeight * c.y) / 100) * scale;
				// The lever is grabbed at arm's length from the pivot, so the angle is
				// well defined the moment the drag starts — which is the whole reason
				// rotation is not dragged from the pivot itself, where atan2 has
				// nothing to measure and a pixel of movement swings the box wildly.
				const now = Math.atan2(event.clientY - pivotY, event.clientX - pivotX);
				const then = Math.atan2(drag.startY - pivotY, drag.startX - pivotX);
				// Turned from the angle as drawn, which on a facing page may be the
				// opposite quarter turn, and written back through the same mirror:
				// a box dragged to -90° there is stored as 90°.
				let deg = (drawnOrigin.rotation ?? 0) + ((now - then) * 180) / Math.PI;
				// Whole degrees, or a quarter turn with Shift — the same bargain the
				// grid makes for position: coarse by default, exact when typed.
				deg = event.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg);
				const turned = normaliseRotation(deg) ?? 0;
				next.rotation = mirroredDrag(origin) ? facingRotation(turned) : turned;
				break;
			}
			case 'centre': {
				// Percent of the box, not millimetres, because that is how the pivot
				// is stored — and clamped to the box, so it can never be dragged
				// somewhere the marker cannot be picked up again.
				// In the stored frame: `dx` has already been flipped back for a
				// quarter-turned box on a facing page, whose pivot is mirrored.
				const was = origin.centre ?? { x: 50, y: 50 };
				const pct = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
				next.centre = {
					x: pct(was.x + (dx / origin.w) * 100),
					y: pct(was.y + (dy / Math.max(1, layout.heights[origin.id] ?? origin.h)) * 100)
				};
				break;
			}
			case 'move': {
				// Shift keeps it on a line through where it started: whichever axis
				// the pointer has gone further along, and none of the other. Read on
				// every move, so it can be pressed or let go mid-drag.
				const along = event.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : null;
				// The held axis is left exactly where it was, not re-placed: placing
				// snaps, and a snap on the axis that is meant to stand still is a
				// line that is not straight.
				if (along !== 'y') next.x = place(origin.x + dx, 'x', origin.w);
				if (along !== 'x') setTop(dy, layout.heights[origin.id] ?? origin.h);
				break;
			}
			case 'e':
				next.w = Math.max(4, size(origin.w + dx));
				break;
			case 'w':
				next.x = place(origin.x + dx, 'x');
				next.w = Math.max(4, size(origin.w - dx));
				break;
			case 's':
				next.h = Math.max(3, size(origin.h + dy));
				break;
			case 'n':
				setTop(dy);
				next.h = Math.max(3, size(origin.h - dy));
				break;
			case 'se':
				next.w = Math.max(4, size(origin.w + dx));
				next.h = Math.max(3, size(origin.h + dy));
				break;
			case 'sw':
				next.x = place(origin.x + dx, 'x');
				next.w = Math.max(4, size(origin.w - dx));
				next.h = Math.max(3, size(origin.h + dy));
				break;
			case 'ne':
				next.w = Math.max(4, size(origin.w + dx));
				setTop(dy);
				next.h = Math.max(3, size(origin.h - dy));
				break;
			case 'nw':
				next.x = place(origin.x + dx, 'x');
				next.w = Math.max(4, size(origin.w - dx));
				setTop(dy);
				next.h = Math.max(3, size(origin.h - dy));
				break;
		}
		// The far edges against the margins too, with the guides on: a move whose
		// right or bottom edge comes within reach of the margin puts it there,
		// and so does a handle dragging that edge. Only the edge being moved —
		// a box is never stretched to reach a guide it was not heading for.
		if (guides) {
			const nearTo = (a: number, b: number) => Math.abs(a - b) < SNAP_TOLERANCE;
			const [, right] = marginEdges.x;
			const [, bottom] = marginEdges.y;
			const east = mode === 'move' || mode === 'e' || mode === 'ne' || mode === 'se';
			const south = !origin.anchor && (mode === 'move' || mode === 's' || mode === 'se' || mode === 'sw');
			if (east && latched.x === null && nearTo(next.x + next.w, right)) {
				if (mode === 'move') next.x = round2(right - next.w);
				else next.w = round2(right - next.x);
				latched.x = right;
			}
			if (south && latched.y === null && nearTo(next.y + next.h, bottom)) {
				if (mode === 'move') next.y = round2(bottom - next.h);
				else next.h = round2(bottom - next.y);
				latched.y = bottom;
			}
		}

		// With Shift, a handle resizes from the edge the words are aligned to,
		// the way a typed W or H does in the bar: the size is whatever the
		// handle made it, and the box is then placed so its right edge stays
		// put for right-aligned text, its middle for centred, its bottom for
		// bottom-aligned. An anchored area's top is its anchor's to decide, so
		// it only ever does this sideways. In the stored frame, as everything
		// written back is — see `placed`.
		if (event.shiftKey && RESIZE_MODES.has(mode)) {
			if (next.w !== origin.w) {
				const align = origin.align ?? template.defaults.align;
				const shift = origin.w - next.w;
				next.x = round2(origin.x + (align === 'right' ? shift : align === 'center' ? shift / 2 : 0));
			}
			if (next.h !== origin.h && !origin.anchor) {
				const valign = origin.valign ?? 'top';
				const shift = origin.h - next.h;
				next.y = round2(origin.y + (valign === 'bottom' ? shift : valign === 'middle' ? shift / 2 : 0));
			}
		}
		guide = { ...latched, flip };
		// What the box under the pointer moved down by, read before it is
		// perhaps put back below: the others move by it too.
		const movedY = origin.anchor ? (next.anchor?.gap ?? 0) - origin.anchor.gap : next.y - origin.y;
		// Carried with the area it follows, the box under the pointer keeps its
		// gap: that area takes the vertical move (or the one at the head of the
		// chain does), and it comes down behind it.
		const moving = drag.mode === 'move' && drag.others.length ? new Set([origin.id, ...drag.others.map((b) => b.id)]) : null;
		if (moving && followsInSet(origin, moving, template.boxes)) next.anchor = origin.anchor;
		onchange?.(next);

		// Whatever snapping did to the box under the pointer is what the others
		// move by, so the selection keeps its shape — every one but those that
		// follow another moving with them, which keep their gap and come along.
		if (moving) {
			const movedX = next.x - origin.x;
			for (const other of drag.others) {
				const moved: Box = { ...other, x: round2(other.x + alongX(other, origin, movedX)) };
				if (movedY && !followsInSet(other, moving, template.boxes)) {
					if (other.anchor) moved.anchor = { ...other.anchor, gap: round2(other.anchor.gap + movedY) };
					else moved.y = round2(other.y + movedY);
				}
				onchange?.(moved);
			}
		}

		if (drag.mode === 'move' && drag.held.length) {
			const movedX = next.x - origin.x;
			if (movedX) {
				for (const held of drag.held) onchange?.({ ...held, x: round2(held.x + alongX(held, origin, movedX)) });
			}
		}
	}

	/**
	 * A sideways move of `movedX`, as the box being carried has to store it.
	 *
	 * A selection can mix areas that follow the fold with areas pinned in place,
	 * and on a left-hand page those two run in opposite directions. Without this
	 * the pinned ones walk the wrong way and the group comes apart as it moves.
	 */
	const alongX = (box: Box, dragged: Box, movedX: number) =>
		mirroredDrag(box) === mirroredDrag(dragged) ? movedX : -movedX;

	const round2 = (v: number) => Math.round(v * 100) / 100;

	/**
	 * A press on an area in zoom and pan, waiting to learn whether it is a tap.
	 * Chosen on the way up, not down: a finger that lands on an area to scroll
	 * the page is not choosing it, and a scroll ends in a pointercancel, not a
	 * pointerup, so it never gets here with the finger still in place.
	 */
	let panTap: { id: string; pointer: number; x: number; y: number; additive: boolean; touch: boolean } | null = null;

	function endPanTap(event: PointerEvent) {
		const tap = panTap;
		panTap = null;
		if (!tap || tap.pointer !== event.pointerId || event.type !== 'pointerup') return;
		if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > HOLD_SLOP) return;
		const box = template.boxes.find((b) => b.id === tap.id);
		if (!box) return;
		// The second of two taps opens the area, as it does out of this mode.
		if (tap.touch) {
			const now = event.timeStamp || Date.now();
			if (lastTap && lastTap.id === box.id && now - lastTap.at < DOUBLE_TAP) {
				lastTap = null;
				onselect?.(box.id, false);
				beginEdit(box);
				return;
			}
			lastTap = { id: box.id, at: now };
		}
		onselect?.(box.id, tap.additive);
	}

	function endDrag(event: PointerEvent) {
		if (panTap) endPanTap(event);
		if (pendingToggle) {
			const id = pendingToggle;
			pendingToggle = null;
			const still = !drag || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= HOLD_SLOP;
			if (still && event.type === 'pointerup') onselect?.(id, true);
		}
		if (!drag) return;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		} catch {
			/* pointer already released */
		}
		drag = null;
		guide = { x: null, y: null };
		spaced = null;
	}

	const HANDLES: DragMode[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

	/**
	 * Where a grown area's given height lies inside it, in mm from its drawn
	 * top: the edges of the frame it was given that its words have grown past.
	 * Grown down, that is the given bottom; grown up from a bottom, the given
	 * top; grown both ways from a middle, both — see `resolveLayout`. Anchored
	 * areas always grow down.
	 */
	function trimEdges(box: Box): number[] {
		const grownBy = (layout.heights[box.id] ?? box.h) - box.h;
		const fy = box.anchor ? 0 : referenceOf('left', box.valign).fy;
		const top = Math.round(grownBy * fy * 100) / 100;
		const edges = [];
		if (fy > 0) edges.push(top);
		if (fy < 1) edges.push(Math.round((top + box.h) * 100) / 100);
		return edges;
	}

	/**
	 * The area's reference point as drawn — `referenceOf`, the point its words
	 * are set from, which the X and Y in the bar measure and the spacing is
	 * read from. On a mirrored left-hand page it is the mirrored point.
	 */
	const referenceFor = (box: Box) => referenceOf(placed(box).align ?? template.defaults.align, box.valign);

	/**
	 * The handle at the reference point, which wears the ring: a corner, or
	 * the middle of an edge where one alignment is centred. None where both
	 * are, since that point is the middle of the area and has no handle.
	 */
	function anchorCorner(box: Box): DragMode | null {
		const { fx, fy } = referenceFor(box);
		const x = fx === 1 ? 'e' : fx === 0 ? 'w' : '';
		const y = fy === 1 ? 's' : fy === 0 ? 'n' : '';
		return (y + x || null) as DragMode | null;
	}

	const DRAG_LABELS: Record<DragMode, string> = {
		move: 'Move',
		rotate: 'Turn',
		centre: 'Move the pivot',
		n: 'Resize',
		s: 'Resize',
		e: 'Resize',
		w: 'Resize',
		ne: 'Resize',
		nw: 'Resize',
		se: 'Resize',
		sw: 'Resize'
	};

	/**
	 * Screen only, and only while it is true: a box drawn in the fallback face
	 * looks exactly like a box whose font simply did not apply, which is how a
	 * slow family reads as a broken one.
	 */
	/**
	 * A text area carrying its own words rather than a column's. Only the text
	 * modes: an unbound image or QR is static in the same sense, but its content
	 * is visibly a fixed thing already, and a badge on every decorative box is
	 * clutter rather than information.
	 */
	const isStatic = (box: Box) => !box.slot && (box.mode === 'plain' || box.mode === 'markdown');

	/**
	 * What an image area holds, for the mark at its corner: a drawing made
	 * here — a data URL, in the cell or the template — or a picture from
	 * somewhere, which is also what an empty one is waiting for.
	 */
	const pictureKind = (box: Box): 'drawing' | 'picture' | null => {
		if (box.mode !== 'image') return null;
		const written = box.slot ? contentOf(box) : (box.static?.dataUrl ?? box.static?.url ?? '');
		return written.trim().startsWith('data:image/') ? 'drawing' : 'picture';
	};

	/**
	 * Boxes other areas hang from. Anchoring is a relationship, and until now only
	 * one end of it was visible: the box that follows said so, and the box being
	 * followed gave no sign that moving it would take anything with it.
	 */
	/** Every box that hangs off this one, at any depth. */
	function dependentsOf(id: string): Box[] {
		const out: Box[] = [];
		const queue = [id];
		const seen = new Set([id]);
		while (queue.length) {
			const held = queue.shift()!;
			for (const box of template.boxes) {
				if (box.anchor?.to !== held || seen.has(box.id)) continue;
				seen.add(box.id);
				out.push(box);
				queue.push(box.id);
			}
		}
		return out;
	}

	const anchorTargets = $derived(
		new Set(template.boxes.map((b) => b.anchor?.to).filter((id): id is string => !!id))
	);

	/**
	 * The other end of the tie, lit up when this end is picked.
	 *
	 * An anchor is a relationship between two boxes and both badges are on
	 * screen, so selecting either one says which the other is. Selecting the box
	 * that is followed accents the badges of its followers; selecting a follower
	 * accents the badge of what it follows. One hop, not the whole chain: two
	 * hops away is not a relationship you have with this box.
	 */
	const litFollowers = $derived(
		new Set(template.boxes.filter((b) => b.anchor && selectedIds.includes(b.anchor.to)).map((b) => b.id))
	);
	/**
	 * The rest of the chain, below the followers.
	 *
	 * An anchor is inherited: an area hanging off an area that hangs off the one
	 * you picked moves when you move it, and so on down. The badges say so at two
	 * strengths — the full mark on what follows this area directly, the same mark
	 * at half strength further down — because the chain has to be visible without
	 * its far end reading as loudly as the end you are holding. Upwards it stays
	 * one hop: what this area follows is a relationship it has, and what *that*
	 * one follows is not.
	 */
	const litKin = $derived(
		new Set(
			selectedIds
				.flatMap((id) => dependentsOf(id).map((b) => b.id))
				.filter((id) => !litFollowers.has(id) && !selectedIds.includes(id))
		)
	);

	const litTargets = $derived(
		new Set(
			template.boxes
				.filter((b) => selectedIds.includes(b.id))
				.map((b) => b.anchor?.to)
				.filter((id): id is string => !!id)
		)
	);

	const waitingFor = (box: Box) =>
		loadingFonts.includes(box.font ?? template.defaults.font);

	// ---- the badges, which are controls -------------------------------------

	/**
	 * A badge says why a box will not do what you might ask of it; two of them
	 * now also undo the reason. Both wear their resting icon until you are about
	 * to act on them, and then the icon of the act itself — on hover, so the
	 * badge says what pressing it does before you press it, and for a moment
	 * afterwards, so a tap on a touchscreen (which never hovers) still gets an
	 * answer.
	 */
	let hoveredBadge = $state<string | null>(null);
	let flashedBadge = $state<string | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | null = null;

	const badgeArmed = (key: string) => hoveredBadge === key || flashedBadge === key;

	function flashBadge(key: string) {
		flashedBadge = key;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flashedBadge = null), 900);
	}

	/**
	 * The threads a hovered tie or mooring badge draws to its other end — the
	 * badge on the area it is tied to, or on each area moored to it. They stand
	 * in for an arrow nobody would read: pointing at a tie shows what it ties,
	 * wherever on the card that is.
	 *
	 * Measured off the badges as drawn rather than worked out from the boxes'
	 * millimetres: a badge is a fixed number of screen pixels off a box that
	 * may be turned, mirrored and grown, and the DOM already knows where all of
	 * that put it. Divided back by the zoom into the trim's own pixels, so the
	 * overlay sits inside the card's transform like everything else on it.
	 */
	let trimEl = $state<HTMLElement | null>(null);

	/**
	 * A finger's tap on the card is not also a tap on whatever slid under it.
	 *
	 * A touch's click is aimed at what is under the finger when it lifts, not
	 * at what it pressed. Pressing an area selects it on the way down, and on a
	 * phone that brings the area bar into the options row above the stage and
	 * pushes the card down a bar's height — so by the time the finger lifted,
	 * the font menu or an alignment button was under it, and got the click.
	 * The click that follows a touch on the card is dropped when it lands off
	 * the card. A mouse is left alone: its click goes to what was both pressed
	 * and released, which a shift underneath cannot change.
	 */
	function guardGhostClick(event: PointerEvent) {
		if (event.pointerType === 'mouse' || !trimEl) return;
		const card = trimEl;
		const swallow = (click: MouseEvent) => {
			window.removeEventListener('click', swallow, true);
			if (click.target instanceof Node && card.contains(click.target)) return;
			click.preventDefault();
			click.stopPropagation();
		};
		// Armed for the moment after the finger lifts, which is when a tap's
		// click arrives. A drag makes no click at all, so the guard stands down
		// shortly after — it must never eat the next, real tap somewhere else.
		const lifted = () => setTimeout(() => window.removeEventListener('click', swallow, true), 350);
		window.addEventListener('click', swallow, true);
		window.addEventListener('pointerup', lifted, { once: true });
		window.addEventListener('pointercancel', lifted, { once: true });
	}
	let threads = $state<string[]>([]);

	/** A tie badge, or its area where the badge is not drawn. */
	function badgeOf(attr: 'tie' | 'moor', id: string): HTMLElement | null {
		const el = trimEl;
		if (!el) return null;
		return (
			el.querySelector<HTMLElement>(`[data-${attr}="${CSS.escape(id)}"]`) ??
			el.querySelector<HTMLElement>(`[data-box-id="${CSS.escape(id)}"]`)
		);
	}

	/** Each pair, tie first and buoy second, as a path in the trim's own pixels. */
	function threadPaths(pairs: Array<[HTMLElement | null, HTMLElement | null]>): string[] {
		if (!trimEl) return [];
		const origin = trimEl.getBoundingClientRect();
		const at = (node: HTMLElement) => {
			const r = node.getBoundingClientRect();
			return { x: (r.left + r.width / 2 - origin.left) / scale, y: (r.top + r.height / 2 - origin.top) / scale };
		};
		return pairs
			.filter((pair): pair is [HTMLElement, HTMLElement] => !!pair[0] && !!pair[1])
			.map(([tie, buoy]) => {
				const a = at(tie);
				const b = at(buoy);
				// An inverted S: leaving each badge upright rather than level, and
				// sagging a little under its own weight the longer it is — a thread,
				// not a connector in a diagram. Bowed out to the left, away from the
				// areas, by as much as the two ends are short of being side by side:
				// two badges one straight above the other had upright handles on one
				// line, and the curve came out a straight dotted rule.
				const mid = (a.y + b.y) / 2;
				const span = Math.hypot(b.x - a.x, b.y - a.y);
				const sag = span * 0.15;
				const bow = Math.max(0, span * 0.45 - Math.abs(b.x - a.x));
				return `M${a.x} ${a.y}C${a.x - bow} ${mid + sag} ${b.x - bow} ${mid + sag} ${b.x} ${b.y}`;
			});
	}

	function showThreads(box: Box, kind: 'tied' | 'moored') {
		// By the badge pointed at, not by what the area happens to be: an area in
		// the middle of a chain wears both, and pointing at its buoy used to draw
		// the thread up to its own parent instead of down to what follows it.
		// Every pair is tie first, buoy second, whichever end is pointed at: the
		// dots always walk from the area that follows to the one it is tied to.
		threads = threadPaths(
			kind === 'tied'
				? box.anchor
					? [[badgeOf('tie', box.id), badgeOf('moor', box.anchor.to)]]
					: []
				: template.boxes
						.filter((b) => b.anchor?.to === box.id)
						.map((b) => [badgeOf('tie', b.id), badgeOf('moor', box.id)])
		);
	}

	/**
	 * With the Boxes box at its dash, every tie on the card, all the time.
	 * Measured after the card has laid out — an anchored area's place is only
	 * known once what it hangs from has been measured — and again whenever the
	 * layout, the zoom or the selection (which moves badges) changes.
	 */
	let allThreads = $state<string[]>([]);
	const showsAllTies = $derived(ties && bounds && !template.locked);

	$effect(() => {
		if (!showsAllTies) {
			allThreads = [];
			return;
		}
		// Read so the effect runs again when any of them changes.
		void [layout, scale, template.boxes, selectedIds];
		const frame = requestAnimationFrame(() => {
			allThreads = threadPaths(
				template.boxes
					.filter((b) => b.anchor && !hidden.has(b.id))
					.map((b) => [badgeOf('tie', b.id), badgeOf('moor', b.anchor!.to)])
			);
		});
		return () => cancelAnimationFrame(frame);
	});

	/** What is drawn: every tie while they are all on show, else the one pointed at. */
	const drawnThreads = $derived(showsAllTies ? allThreads : threads);

	/**
	 * Whether this area's badges are on show at all. Only on the area you are
	 * working on and on the areas tied to it: a badge on every area of a busy
	 * card was a field of little marks competing with the design, and what a
	 * badge says — locked, tied, static — matters when you are about to act on
	 * that area. Its chain comes along because moving it moves them.
	 */
	const showsBadges = (box: Box) =>
		isSelected(box) || litFollowers.has(box.id) || litKin.has(box.id) || litTargets.has(box.id);

	/** Whether the column of badges hangs off this box's right-hand edge. */
	const hasBadges = (box: Box) =>
		bounds && !template.locked && showsBadges(box) && !!(box.locked || isStatic(box) || pictureKind(box) || editsCell(box));

	/**
	 * A selected area whose words come out of a cell carries the way into that
	 * cell, full size — the same editor Edit opens under the table, and the
	 * same icon, for an area whose words are not the design's to type into
	 * in place. Words, not pictures: a picture's cell has the pencil.
	 */
	const editsCell = (box: Box) =>
		interactive && isSelected(box) && !!box.slot && !!mapping[box.slot] && !!row && !pictureKind(box) && !shownAsMedia(box.mode);

	/** How many badges that column holds — the shears step down below them. */
	const badgeCount = (box: Box) =>
		hasBadges(box)
			? [box.locked, isStatic(box), pictureKind(box), editsCell(box)].filter(Boolean).length
			: 0;

	/** Cast off: every box moored to this one keeps its place and loses the tie. */
	function releaseDependents(box: Box) {
		const moored = dependentsOf(box.id).filter((b) => b.anchor?.to === box.id && !b.locked);
		if (!moored.length) return;
		onaction?.('Cast off');
		// The resolved top is where the box is actually sitting, so writing it back
		// as its own y is what "keeps its place" means — an anchor released to the
		// box's stale y would jump it up the card.
		for (const held of moored) onchange?.({ ...held, anchor: null, y: round2(layout.tops[held.id] ?? held.y) });
	}

	/**
	 * Take this box's own lock off.
	 *
	 * The padlock badge used to be the one mark here that only *said* something
	 * while the two anchor badges beside it were also the way out of what they
	 * said — so the pointer landed on the padlock, found it dead, and the badge
	 * that did answer was the buoy, which is not about locking at all. It is a
	 * button now, and the buoy has stopped wearing an open padlock when armed.
	 */
	function unlockBox(box: Box) {
		if (!box.locked || template.locked) return;
		onaction?.('Unlock the area');
		onchange?.({ ...box, locked: undefined });
	}

	/**
	 * Double-click the pivot, or the knob on its arm, to put it back.
	 *
	 * Both marks are dragged to a value with no number written anywhere on the
	 * card, and both have a resting state that is the only one most cards want:
	 * the middle, and upright. Getting back to either by dragging is a game of
	 * pixel-hunting; the fields in the bar do it exactly, and a double-click on
	 * the mark itself is the shortest line back. It was a press and hold, until
	 * a hold came to mean "what is this?" everywhere in the app.
	 *
	 * The drag in flight is dropped along with it: it snapshotted the old value
	 * at pointerdown, and a move arriving afterwards would write that snapshot
	 * straight back over the reset.
	 */
	function resetPivot(box: Box) {
		if (!editable(box) || !box.centre) return;
		drag = null;
		onaction?.('Centre the pivot');
		onchange?.({ ...box, centre: undefined });
	}

	function resetRotation(box: Box) {
		if (!editable(box) || !box.rotation) return;
		drag = null;
		onaction?.('Straighten the area');
		onchange?.({ ...box, rotation: undefined });
	}

	/** Break this box's own tie, again without moving it. */
	function breakAnchor(box: Box) {
		if (!box.anchor || box.locked) return;
		onaction?.('Break the anchor');
		onchange?.({ ...box, anchor: null, y: round2(layout.tops[box.id] ?? box.y) });
	}

	// ---- typing into the card ------------------------------------------------

	/**
	 * Words go into the card, not only into the bar or the table.
	 *
	 * A textarea laid over the content rather than a `contenteditable`: the box
	 * holds *text* — Markdown source for a Markdown area — and a contenteditable
	 * would hand back markup nobody asked for. It inherits everything from the
	 * box it sits in, so what you type is set the way it will print.
	 */
	/**
	 * Not `editable`: a locked page is a locked *design* — nothing moves,
	 * nothing is restyled — and the words in an area are the content the design
	 * holds, which a lock on the layout was never meant to freeze. An area's own
	 * lock still refuses it; a locked table still refuses a typed cell, where
	 * the page writes it.
	 */
	const canEdit = (box: Box) =>
		interactive && contentOpen(box) && (box.mode === 'plain' || box.mode === 'markdown');

	/**
	 * Whether what an area holds can be changed from the card. An area's own
	 * lock is on the area — where it is, how it looks — and on its own words,
	 * which are part of it; but the words of an area bound to a column are the
	 * row's, and the row answers to the table's lock, not the area's. So a
	 * locked data field still opens for typing or drawing, and the page refuses
	 * the edit if the table is locked (`refuseLockedTable`).
	 */
	const contentOpen = (box: Box) => !box.locked || (!!box.slot && !!mapping[box.slot]);

	function beginEdit(box: Box) {
		// A picture is the one thing not edited in place: an area on a card is
		// often a centimetre across, which is somewhere to show a drawing and
		// nowhere to make one. The same double-click opens it full screen —
		// on a locked page too, like typing: a drawing is content, not layout.
		if (interactive && contentOpen(box) && takesADrawing(box.mode)) {
			ondraw?.(box.id);
			return;
		}
		if (!canEdit(box)) return;
		onedit?.(box.id);
	}

	const focusOnMount = (node: HTMLTextAreaElement) => {
		node.focus();
		// At the end, not selecting everything: this is a double-click into words
		// that already exist, and replacing them wholesale is rarely the intent.
		node.setSelectionRange(node.value.length, node.value.length);
	};

	function onEditorKeydown(event: KeyboardEvent) {
		// Escape and Ctrl/Cmd+Enter leave; a plain Enter is a line break, because
		// a Markdown area is a paragraph or several.
		if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
			event.preventDefault();
			event.stopPropagation();
			onedit?.(null);
		}
	}
</script>

<!-- Drawn over the room the transparent CSS border is holding, so it covers
     exactly what that border would have painted. Sized in millimetres against
     a viewBox of the same numbers, which makes one user unit one millimetre
     and the stroke widths literal. A closed outline is a stamp's paper, filled
     in the border color: the perforated sheet the field is printed on. -->
{#snippet drawnEdge(box: Box, strokes: HandStroke[])}
	<svg
		class="hand-border"
		aria-hidden="true"
		viewBox="0 0 {box.w} {layout.heights[box.id] ?? box.h}"
		style="width:{box.w}mm;height:{layout.heights[box.id] ?? box.h}mm"
		fill="none"
		stroke={borderColorOf(box)}
	>
		{#each strokes as stroke, i (i)}
			<path
				d={stroke.d}
				stroke-width={stroke.width}
				stroke-dasharray={stroke.dash ?? 'none'}
				stroke-linecap={stroke.cap ?? 'butt'}
				fill={stroke.closed ? borderColorOf(box) : 'none'}
			/>
		{/each}
	</svg>
{/snippet}

<!-- Plain text with any unknown `%%name%%` in it marked — see `shownTextOf`.
     Written on one line: the text is `white-space: pre-wrap`, and a newline
     between these tags would be drawn. -->
<!-- An area's outline. Following the fold, its inner edge is a fold line —
     dot and dash, the way a fold is marked on anything meant to be folded —
     so the rect gives way to four lines, in percentages like the rect, so
     nothing is measured. -->
{#snippet outline(kind: string, fold: 'left' | 'right' | null)}
	{#if fold}
		{@const inner = fold === 'left' ? '0' : '100%'}
		{@const outer = fold === 'left' ? '100%' : '0'}
		<svg class="chrome {kind}" aria-hidden="true">
			<line x1="0" y1="0" x2="100%" y2="0" />
			<line x1="0" y1="100%" x2="100%" y2="100%" />
			<line x1={outer} y1="0" x2={outer} y2="100%" />
			<line class="fold" x1={inner} y1="0" x2={inner} y2="100%" />
		</svg>
	{:else}
		<svg class="chrome {kind}" aria-hidden="true"><rect width="100%" height="100%" /></svg>
	{/if}
{/snippet}

{#snippet marked(text: string)}{#each segments(text) as part, i (i)}{#if part.unknown}<span class="unknown-placeholder" title="No column called this in the table — or the cell naming its own column">{part.text}</span>{:else}{part.text}{/if}{/each}{/snippet}

<!-- The shears, which are also the switch between cutting and growing. Red and
     astride the cut on an area that is cutting its words off, where pressing
     lets it grow; blue and faint beside the trim line on one that has grown,
     where pressing cuts it back to the height it was given. -->
<!-- A line of plain text, as a row of words, leader and words at the right
     edge when it has a `%%%` (or a tab, with a leader set) — `tabSplit`,
     `leaderStyle`, the same as Markdown's. -->
{#snippet leadered(line: string, leader: Leader)}{@const parts = tabSplit(line, leader !== 'none')}{#if parts}<span class="tabbed"
		><span>{@render marked(parts[0])}</span><span style={leaderStyle(leader)}></span><span class="tab-right"
			>{@render marked(parts[1])}</span
		></span
	>{:else}{@render marked(line)}{/if}{/snippet}

{#snippet shears(box: Box, cutting: boolean)}
	<button
		class="overflow-mark"
		class:offered={!cutting}
		style="--edge:{cutting ? '100%' : `${trimEdges(box)[0]}mm`};--stack:{badgeCount(box)}"
		disabled={!editable(box)}
		title={cutting
			? 'The content does not fit — this area is cutting off what will print. Press to let it grow instead.'
			: 'This area has grown past the height it was given. Press to cut it at that height instead.'}
		aria-label={cutting ? 'Let this area grow to fit' : 'Cut this area at its height'}
		onpointerdown={(e) => e.stopPropagation()}
		onpointerenter={() => (hoveredBadge = `${box.id}:cut`)}
		onpointerleave={() => (hoveredBadge = null)}
		onclick={() => {
			flashBadge(`${box.id}:cut`);
			onaction?.(cutting ? 'Let the area grow' : 'Cut the area at its height');
			onchange?.({ ...box, overflow: cutting ? 'grow' : 'clip' });
		}}
	>
		<!-- Shut while the pointer is on them, like the other badges that are
		     buttons: the act of pressing — a cut made, or one let go of. -->
		<Icon name={badgeArmed(`${box.id}:cut`) && editable(box) ? 'cut-closed' : 'cut'} size={11} fixed />
	</button>
{/snippet}

<div
	class="card"
	data-page
	class:editing={interactive}
	class:frozen={interactive && !!template.locked}
	class:panning={interactive && panning}
	style={cardStyle()}
	lang="en"
>
	{#if underlay}
		<div class="underlay" aria-hidden="true">{@render underlay()}</div>
	{/if}
	<div
		class="trim"
		bind:this={trimEl}
		style="width:{template.page.w}mm;height:{template.page.h}mm"
		onpointerdowncapture={guardGhostClick}
	>
		{#if customCss}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- scopeCss confines it to .trim and strips @import, remote url() and any closing style tag -->
			{@html styleTag(customCss)}
		{/if}

		<!-- The page itself, as a template's CSS can name it: `#page-3`, its
		     place — `#cover`, `#inside-cover`, `#inside-back-cover`,
		     `#back-cover`, on a second wrapper — and `.recto`, `.verso` and the
		     theme — see `pageHooks`. Inside the trim rather than on it, because
		     css.ts scopes every rule to `.trim …`, so `#cover .area` is
		     `.trim #cover .area` and needs the id between the two. No box of
		     their own (`display: contents`): every area is still placed against
		     the trim, and nothing measures differently. -->
		<div class="page-hooks {pageHooks.classes}" id={pageHooks.id}>
		<div class="page-hooks" id={pageHooks.place}>

		{#if interactive && guides}
			<!-- The page margins, as a guide, on a toggle of their own beside the
			     grid's: lines to place against and to snap to, which a page may
			     want without a grid over the whole of it. First in the trim, so
			     every area paints over it — and over the grid, which is under the
			     trim altogether. -->
			{@const m = drawnMargins}
			<div
				class="margin-guide"
				aria-hidden="true"
				style="top:{m.top}mm;right:{m.right}mm;bottom:{m.bottom}mm;left:{m.left}mm"
			></div>
			{#if template.facing}
				<!-- The fold: just outside the inner trim edge, past any bleed, so
				     it is never taken for something on the paper. -->
				<svg
					class="fold-guide {verso ? 'right' : 'left'}"
					aria-hidden="true"
					style="--fold-off:{bleed}mm"
				><line x1="50%" y1="0" x2="50%" y2="100%" /></svg>
			{/if}
		{/if}

		{#each template.boxes as box (box.id)}
			{@const empty = hidden.has(box.id)}
			<!-- The area as this row colors it — see `colorsFromRow`. Only what
			     is painted reads it; everything that moves, measures or writes
			     the area back keeps the stored one, so a row's color can never be
			     saved as the template's. -->
			{@const look = colorsFromRow(box, row)}
			{@const strokes = handStrokes(look)}
			<div
				class="area content-{box.slot ? 'field' : shownAsMedia(box.mode) ? 'image' : 'static'} mode-{box.mode}"
				class:columns={inColumns(box)}
				class:outlined={bounds && !empty}
				class:selected={interactive && isSelected(box)}
				class:interactive={editable(box)}
				class:clipped={(box.overflow === 'clip' || box.overflow === 'shrink') && !empty}
				class:locked={!!box.locked}
				class:no-padding={!box.padding}
				class:grouped={!!box.group}
				class:cramped={interactive && isSelected(box) && cramped(box)}
				class:font-loading={interactive && waitingFor(box)}
				class:flashing={flashIds.includes(box.id)}
				class:dropping={dropId === box.id}
				style={boxStyle(look)}
				{...idFor(box)}
				data-box-id={box.id}
				use:measure={box.id}
				use:fitWords={box.overflow === 'shrink' && (box.mode === 'plain' || box.mode === 'markdown') ? box.id : null}
				onpointerdown={(e) => startDrag(e, box, 'move')}
				ondblclick={(e) => {
					if (!interactive) return;
					e.preventDefault();
					beginEdit(box);
				}}
				oncontextmenu={(e) => {
					if (!interactive) return;
					e.preventDefault();
					// Right-clicking inside an existing selection acts on all of it;
					// right-clicking outside one selects the box first.
					if (!isSelected(box)) onselect?.(box.id, false);
					onmenu?.(box.id, e.clientX, e.clientY);
				}}
				onpointermove={moveDrag}
				onpointerup={endDrag}
				onpointercancel={endDrag}
				ondragover={(e) => dragOver(e, box)}
				ondragleave={() => (dropId = dropId === box.id ? null : dropId)}
				ondrop={(e) => drop(e, box)}
				role="presentation"
			>
				<!-- A stamp's paper goes under the field printed on it; every other
				     border drawn in SVG goes over the fill, as a CSS border would. -->
				{#if strokes.length && stamped(box)}
					{@render drawnEdge(look, strokes)}
				{/if}
				{#if surfaceStyle(look)}
					<div class="surface" aria-hidden="true" style={surfaceStyle(look)}></div>
				{/if}
				{#if strokes.length && !stamped(box)}
					{@render drawnEdge(look, strokes)}
				{/if}
				<div
					class="content"
					style={[columnsStyle(box), shrunk[box.id] && box.overflow === 'shrink' ? `font-size:${shrunk[box.id]}em` : '']
						.filter(Boolean)
						.join(';') || undefined}
					class:being-edited={editingId === box.id}
					class:shifted={!!baselineOf(box, template.defaults) && (box.mode === 'plain' || box.mode === 'markdown')}
				>
					{#if placeholderFor(box)}
						<span class="placeholder">{placeholderFor(box)}</span>
					{:else if box.mode === 'markdown'}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes every leaf; flagUnknown writes a fixed span around text it has already escaped -->
						{@html flagUnknown(renderMarkdown(shownTextOf(box), {
							size: box.size ?? template.defaults.size,
							md: box.md,
							paragraph: paragraphOf(box),
							lineHeight: box.lineHeight ?? template.defaults.lineHeight,
							list: listOf(box, template.defaults),
							leader: leaderOf(box)
						}))}
					{:else if box.mode === 'qr'}
						<span class="media" style="height:{mediaHeight(box)}">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated here, not user markup -->
							{@html qrFor(look)}
						</span>
					{:else if shownAsMedia(box.mode)}
						{@const media = mediaOf(box)}
						<!-- A color and a tile are both drawn by the box's own background,
						     in boxStyle, so there is nothing to put in here for either. -->
						{#if media.svg || (media.src && box.fit !== 'repeat')}
							<span class="media" style="height:{mediaHeight(box)}">
								{#if media.svg}
									<!-- eslint-disable-next-line svelte/no-at-html-tags -- safeSvg is the chokepoint; fitSvg only rewrites its width and height -->
									{@html fitSvg(safeSvg(media.svg), box.fit)}
								{:else}
									<img
									src={media.src}
									alt=""
									class:drawn={drawnByHand(media.src)}
									style="object-fit:{box.fit ?? 'contain'}{drawnByHand(media.src)
										? ';image-rendering:pixelated'
										: ''}"
								/>
								{/if}
							</span>
						{/if}
					{:else if paragraphOf(box)}
						<!-- With a paragraph style, every line of plain text is a
						     paragraph — Return starts a new one, as in any word
						     processor — so each is a block the style can space or
						     indent. An empty line keeps its height. -->
						{@const para = paragraphOf(box)!}
						<!-- A space in lines of the leading, an indent in em. -->
						{@const step = `${Math.round(para.amount * (para.mode === 'space' ? (box.lineHeight ?? template.defaults.lineHeight) : 1) * 1000) / 1000}em`}
						<span class="paras">
							{#each shownTextOf(box).split('\n') as line, i (i)}
								<span
									class="para"
									style={para.mode === 'space' ? `margin-bottom:${step}` : i > 0 ? `text-indent:${step}` : ''}
								>{#if line}{@render leadered(line, leaderOf(box))}{:else}&nbsp;{/if}</span>
							{/each}
						</span>
					{:else if shownTextOf(box).split('\n').some((line) => tabSplit(line, leaderOf(box) !== 'none'))}
						<!-- Line by line only when a line needs its leader: one run of
						     text otherwise, as plain text always was. -->
						<span class="paras">
							{#each shownTextOf(box).split('\n') as line, i (i)}
								<span class="para">{#if line}{@render leadered(line, leaderOf(box))}{:else}&nbsp;{/if}</span>
							{/each}
						</span>
					{:else}
						<span class="plain">{@render marked(shownTextOf(box))}</span>
					{/if}
				</div>

				{#if editingId === box.id && canEdit(box)}
					<!-- Over the content, not instead of it: the box keeps its measured
					     height, so nothing anchored below it hops about while you type,
					     and the words underneath show through where the caret is not. -->
					<textarea
						class="inline-editor"
						spellcheck="false"
						use:focusOnMount
						use:completePlaceholders={row ? Object.keys(row) : []}
						value={rawContentOf(box)}
						oninput={(e) => ontext?.(box, e.currentTarget.value)}
						onkeydown={onEditorKeydown}
						onblur={() => onedit?.(null)}
						onpointerdown={(e) => e.stopPropagation()}
						ondblclick={(e) => e.stopPropagation()}
					></textarea>
				{/if}

				<!-- The lines around a box are strokes, not borders. A browser rounds
				     border-width to whole device pixels, so a bound asked for at
				     1.33px inside a 75% card was drawn at 1px and one asked for at
				     0.5px inside a 200% card was drawn at 2px. An SVG stroke is not
				     rounded, so var(--line) lands exactly whatever the zoom. -->
				<!-- Not on a selected area: the selection is its outline, and a dashed
				     bound drawn under a solid one doubled every edge. -->
				{#if bounds && !empty && !(interactive && isSelected(box)) && !isParked(box, template.page, bleed)}
					{@render outline('bounds', foldSide(box))}
				{/if}
				{#if gapsOf(box).length && ((bounds && !empty && !isParked(box, template.page, bleed)) || (interactive && isSelected(box)))}
					<!-- Over the words' own box, as the padding guide is: inset by the
					     padding from the padding box absolute children are placed in. -->
					<svg class="chrome pad gaps" aria-hidden="true">
						{#each gapsOf(box) as [left, right], g (g)}
							<line x1="{left * 100}%" y1="0" x2="{left * 100}%" y2="100%" />
							<line x1="{right * 100}%" y1="0" x2="{right * 100}%" y2="100%" />
						{/each}
					</svg>
				{/if}
				{#if interactive && isSelected(box)}
					{#if box.padding}
						<!-- Where the words actually start. -->
						<svg class="chrome pad" aria-hidden="true"><rect width="100%" height="100%" /></svg>
					{/if}
					{@render outline('selection', foldSide(box))}
				{/if}

				{#if bounds && !empty && box.overflow === 'grow' && (layout.heights[box.id] ?? box.h) > box.h + 0.05}
					<!-- The trim line: the height the area was given, where its content
					     has grown it past that. Sparser than the bound, so it is not
					     taken for one, and with the shears beside it in blue — the cut
					     this area *could* make, offered rather than made. -->
					{#each trimEdges(box) as edge (edge)}
						<svg class="chrome original-edge" aria-hidden="true" style="top:{edge}mm">
							<line x1="0" y1="0" x2="100%" y2="0" />
						</svg>
					{/each}
					{@render shears(box, false)}
				{/if}

				<!-- The cut is a clipped area's alone: a growing one is never cut —
				     it has the trim line above instead. -->
				{#if bounds && !empty && (box.overflow === 'clip' || box.overflow === 'shrink') && overflowing[box.id]}
					<!-- Where the words are actually severed, drawn as the cut it is: a
					     dashed red line along the bottom edge, with the shears straddling
					     it at the end of the stroke. The other three edges keep the plain
					     bound they always had — only this one is doing the cutting, and
					     saying so on all four would say nothing. -->
					<svg class="chrome cut-line" aria-hidden="true">
						<line x1="0" y1="100%" x2="100%" y2="100%" />
					</svg>
					{@render shears(box, true)}
				{/if}

				<!-- Every badge here says why *this* area will not do what you might
				     ask of it, and on a locked page that is the same answer for all
				     of them: the page is locked. The band over the sheet says it once,
				     so the column of per-area reasons is noise — and two of these are
				     buttons that would be refused anyway. The overflow mark below is
				     not one of these: it is about what will print, which a lock does
				     not change. -->
				{#if bounds && !template.locked && (showsBadges(box) || showsAllTies) && (box.anchor || anchorTargets.has(box.id))}
					<!-- The anchor's two ends, in a row of their own off the top-left
					     corner: the buoy in the corner on one that others follow, and to
					     its left the tie on an area that follows another — a middle link
					     in a chain wears both. Off the right-hand column because on a shallow area four
					     badges are taller than the area itself, and these are the badges
					     areas most often carry; together because they are one
					     relationship, and the thread between them runs from this side. -->
					<span class="badges tie">
						{#if box.anchor}
						<button
							class="badge action"
							class:lit={litFollowers.has(box.id)}
							class:lit-edge={litKin.has(box.id)}
							disabled={!editable(box)}
							title="Tied to another area — its top follows that area's bottom. Press to break the tie and leave this area where it is."
							aria-label="Break this area's anchor"
							onpointerdown={(e) => e.stopPropagation()}
							data-tie={box.id}
							onpointerenter={() => {
								hoveredBadge = `${box.id}:tied`;
								showThreads(box, 'tied');
							}}
							onpointerleave={() => {
								hoveredBadge = null;
								threads = [];
							}}
							onclick={() => {
								threads = [];
								flashBadge(`${box.id}:tied`);
								breakAnchor(box);
							}}
						>
							<Icon name={badgeArmed(`${box.id}:tied`) ? 'unlink' : 'link'} size={11} fixed />
						</button>
						{/if}
						{#if anchorTargets.has(box.id)}
							<button
								class="badge action moored"
								class:lit={litTargets.has(box.id)}
								disabled={!!template.locked}
								title="Other areas are moored to this one — moving it moves them too. Press to cast them off and leave them where they are."
								aria-label="Cast off the areas anchored to this one"
								onpointerdown={(e) => e.stopPropagation()}
								data-moor={box.id}
								onpointerenter={() => {
									hoveredBadge = `${box.id}:moored`;
									showThreads(box, 'moored');
								}}
								onpointerleave={() => {
									hoveredBadge = null;
									threads = [];
								}}
								onclick={() => {
									threads = [];
									flashBadge(`${box.id}:moored`);
									releaseDependents(box);
								}}
							>
								<Icon name={badgeArmed(`${box.id}:moored`) ? 'sailboat' : 'harbor'} size={11} fixed />
							</button>
						{/if}
					</span>
				{/if}

				{#if hasBadges(box)}
					<!-- Why the box will not do what you might ask of it, stacked at its
					     corner. All but the static-text mark are buttons — the reason and the way out
					     of it in the same 13 pixels — and each swaps to the icon of the
					     undoing while the pointer is on it, so pressing one holds no
					     surprise. Which is also why no two of them wear the same armed
					     icon: the padlock opens the padlock, and the buoy casts off,
					     which is a boat. -->
					<span class="badges">
						{#if editsCell(box)}
							<button
								class="badge action"
								title={`Edit “${mapping[box.slot!]}” for this row, full size in the table`}
								aria-label="Edit this area's cell"
								onpointerdown={(e) => e.stopPropagation()}
								onclick={() => oneditcell?.(box.id)}
							>
								<Icon name="task-edit" size={11} fixed />
							</button>
						{/if}
						{#if isStatic(box)}
							<span class="badge" title="Static text — this says the same on every card, because it is not plugged into a column">
								<Icon name="text-creation" size={11} fixed />
							</span>
						{/if}
						<!-- What a picture area holds, beside the static text's mark. The
						     pencil is also the way into the drawing — the same as a
						     double-click, for anybody who has not found that. -->
						{#if pictureKind(box) === 'drawing'}
							<button
								class="badge action"
								disabled={!editable(box)}
								title={box.slot ? 'An image drawn here, from this row\'s cell — press to draw on it' : 'An image drawn here, the same on every card — press to draw on it'}
								aria-label="Draw in this area"
								onpointerdown={(e) => e.stopPropagation()}
								onclick={() => ondraw?.(box.id)}
							>
								<Icon name="edit" size={11} fixed />
							</button>
						{:else if pictureKind(box) === 'picture'}
							<span class="badge" title={box.slot ? 'An image, from this row\'s cell — double-click to draw instead' : 'An image, the same on every card — double-click to draw instead'}>
								<Icon name="image" size={11} fixed />
							</span>
						{/if}
						{#if box.locked}
							<button
								class="badge action"
								title="Locked — no dragging, no resizing, no option changes. Press to unlock this area."
								aria-label="Unlock this area"
								onpointerdown={(e) => e.stopPropagation()}
								onpointerenter={() => (hoveredBadge = `${box.id}:locked`)}
								onpointerleave={() => (hoveredBadge = null)}
								onclick={() => {
									flashBadge(`${box.id}:locked`);
									unlockBox(box);
								}}
							>
								<Icon name={badgeArmed(`${box.id}:locked`) ? 'unlocked' : 'locked'} size={11} fixed />
							</button>
						{/if}
					</span>
				{/if}

				{#if interactive && isSelected(box) && soleSelection}
					{#if editable(box)}
						<!-- Turning happens about the pivot, so the controls for it live
						     on the pivot: a mark on the top edge would say nothing about
						     where the box is actually going to turn, and the pivot moves.
						     Two marks rather than one gesture with a modifier, because
						     they do two different things and a modifier nobody finds is a
						     feature nobody has — the crosshair moves the point turned
						     about, the knob on the arm beside it swings the box. The X and
						     Y in the bar place the pivot exactly. Both are drawn on an
						     upright box, because the lever is the rotation control and
						     has to be there before there is any rotation to show. -->
						<span
							class="pivot"
							ondblclick={(e) => {
								// Not also a double-click on the area, which opens it for typing.
								e.stopPropagation();
								resetPivot(box);
							}}
							style="left:{(placed(box).centre ?? { x: 50, y: 50 }).x}%;top:{(placed(box).centre ?? { x: 50, y: 50 }).y}%"
							title="The point this area turns about — drag it, or type it in the bar. Double-click to put it back in the middle."
							onpointerdown={(e) => startDrag(e, box, 'centre')}
							onpointermove={moveDrag}
							onpointerup={endDrag}
							onpointercancel={endDrag}
							role="presentation"
						><svg class="pivot-mark" viewBox="0 0 15 15" aria-hidden="true"
								><path d="M0 7.5H15M7.5 0V15" /><circle cx="7.5" cy="7.5" r="4" /></svg
							></span>
						<span
							class="lever"
							ondblclick={(e) => {
								e.stopPropagation();
								resetRotation(box);
							}}
							style="left:{(placed(box).centre ?? { x: 50, y: 50 }).x}%;top:{(placed(box).centre ?? { x: 50, y: 50 }).y}%"
							title="Drag to turn this area — hold Shift for 15° steps. Double-click to set it upright."
							onpointerdown={(e) => startDrag(e, box, 'rotate')}
							onpointermove={moveDrag}
							onpointerup={endDrag}
							onpointercancel={endDrag}
							role="presentation"
						></span>
						{@const corner = anchorCorner(box)}
						{#each HANDLES as handle (handle)}
							<span
								class="handle h-{handle}"
								onpointerdown={(e) => startDrag(e, box, handle)}
								onpointermove={moveDrag}
								onpointerup={endDrag}
								onpointercancel={endDrag}
								role="presentation"
							>{#if handle === corner}<svg class="anchor-mark" viewBox="0 0 14 14" aria-hidden="true"
										><circle cx="7" cy="7" r="3.5" /></svg
									>{/if}</span>
						{/each}
					{/if}
				{/if}
			</div>
		{/each}


		{#if template.pageNumber.enabled && pageNumber != null}
			<!-- Three elements rather than one string, so a template's own CSS can
			     reach each part: `.page-number .of::before { content: ' of ' }` is
			     the whole point of the separator being an empty element. -->
			<div class="page-number" style={pageNumberStyle()}>
				<span class="of-current">{pageNumber}</span>
				{#if template.pageNumber.showTotal && pageCount != null}
					<span class="of" aria-hidden="true"></span><span class="of-total">{pageCount}</span>
				{/if}
			</div>
		{/if}

		{#if drawnThreads.length}
			<svg class="chrome threads" aria-hidden="true">
				{#each drawnThreads as d, i (i)}<path {d} />{/each}
			</svg>
		{/if}

		{#if guide.x !== null}
			<span
				class="guide vertical"
				style="left:{guide.flip ? template.page.w - guide.x : guide.x}mm"
			></span>
		{/if}
		{#if guide.y !== null}
			<span class="guide horizontal" style="top:{guide.y}mm"></span>
		{/if}
		<!-- The gaps: a line from edge to edge with its millimetres, the pair
		     either side marked = when they match. -->
		{#each readouts as r, i (i)}
			<span
				class="spacing {r.axis === 'x' ? 'across' : 'down'}"
				class:equal={r.equal}
				style={r.axis === 'x'
					? `left:${r.from}mm;width:${r.gap}mm;top:${r.at}mm`
					: `top:${r.from}mm;height:${r.gap}mm;left:${r.at}mm`}
				><span class="spacing-label">{r.equal ? '= ' : ''}{Math.round(r.gap * 10) / 10}</span></span
			>
		{/each}
		</div>
		</div>
	</div>

	{#if bleed > 0 && template.bleed.cropMarks}
		<div class="crop-marks" aria-hidden="true">
			{#each ['tl', 'tr', 'bl', 'br'] as corner (corner)}
				<span class="mark {corner}" style="--bleed:{bleed}mm;--crop-gap:1mm"></span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.card {
		position: relative;
		background: #fff;
		box-sizing: border-box;
		overflow: hidden;
		color: #000;
		/* What a drag corner measures, before the zoom is taken back off it. It is
		   a token because the badges are sized from it: the marks on an area are
		   one family, and a handle and a badge drifting apart is how a card ends
		   up with two ideas of how big a small thing is. Restated for a coarse
		   pointer below, where a handle is smaller so a finger can see past it. */
		--handle: 14px;
		/* Half again the drag corner. A badge is an indicator that is also a
		   button — it breaks a tie, casts off, unlocks — and at the handle's own
		   size it was the smallest target on the card while being the one that
		   does something irreversible. Bigger than what it sits beside is also
		   what stops it reading as a fourth handle. */
		--badge: calc(var(--handle) * 1.5 * var(--ui-scale, 1));
		/* The app's button radius, drawn against the zoom like the size is. Taken
		   in the card's own frame it grew with the page: a hairline of a curve at
		   50%, a pill at 400%, on a badge that stayed the same size throughout. */
		--badge-radius: calc(var(--radius-button) * var(--ui-scale, 1));
		/* Paper color is part of the artwork, not decoration the printer may
		   drop — though the browser still asks for "background graphics". */
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
	}

	/* The editor does not clip. A box dragged past the edge stays visible and
	   stays grabbable — losing the handles of something you can no longer see is
	   worse than showing you what will not print. Everywhere the card is *output*
	   — the print run, the PNG export, the contact sheet — keeps the clip above,
	   so nothing spills onto a neighbouring page. */
	.card.editing {
		overflow: visible;
	}

	.trim {
		position: relative;
		box-sizing: border-box;
	}

	/* A wrapper for the page's own id and classes, and nothing else. */
	.page-hooks {
		display: contents;
	}

	.area {
		position: absolute;
		box-sizing: border-box;
		overflow-wrap: break-word;
		display: flex;
		flex-direction: column;
	}

	/* Out of flow, and anchored to the *border* box: an absolutely positioned
	   child is placed against the padding box, so it is pushed back out by the
	   border widths the box put in these properties. Out of flow also means it
	   is not part of what `measure` reads, so a border cannot grow the box it
	   is drawn around. */
	/* Over the whole border box — the box's border is its room, not its paint —
	   and under everything else in the area. */
	.surface {
		position: absolute;
		top: calc(-1 * var(--bw-t, 0mm));
		right: calc(-1 * var(--bw-r, 0mm));
		bottom: calc(-1 * var(--bw-b, 0mm));
		left: calc(-1 * var(--bw-l, 0mm));
		box-sizing: border-box;
		pointer-events: none;
		opacity: var(--ink, 1);
	}

	.hand-border {
		opacity: var(--ink, 1);
		position: absolute;
		top: calc(-1 * var(--bw-t, 0mm));
		left: calc(-1 * var(--bw-l, 0mm));
		pointer-events: none;
		/* A wobble strays a fraction of a millimetre past the line it follows,
		   which at the trim edge of the card is the difference between a drawn
		   border and a clipped one. */
		overflow: visible;
	}

	/* The one flex item in the box, so `justify-content` still places the content
	   vertically, and so the content can be measured without the handles and
	   badges that hang off the box's edges. */
	/* Positioned, so it paints over the surface before it rather than under
	   it — an absolutely placed layer otherwise paints over in-flow content. */
	.content {
		position: relative;
		width: 100%;
		min-width: 0;
		opacity: var(--ink, 1);
	}

	/* A clipped box cuts its content at its own edge, but must not cut the
	   handles, pivot and badges that sit outside that edge — they are siblings of
	   .content, so clipping here reaches the content and nothing else. The card
	   settles the same argument one level up, in .card.editing.

	   min-height: 0 is load-bearing: a flex item refuses by default to shrink
	   below its content height, so without it the content would keep spilling out
	   of the fixed-height box and there would be nothing for overflow to cut. */
	.area.clipped > .content {
		overflow: hidden;
		min-height: 0;
	}

	/* Moved on the children, not on .content: a clipped area clips at
	   .content's edge, and moving .content would have moved the cut with it.
	   Relative, so nothing is measured differently — the area is as tall as
	   it was and whatever is anchored under it stays where it was. */
	.content.shifted > :global(*) {
		position: relative;
		top: var(--baseline, 0);
	}

	.plain {
		display: block;
		white-space: pre-wrap;
	}

	/* A tabbed line: the words, the leader filling what is left, the words at
	   the right edge — all on the baseline, where the leader's rule sits. */
	.tabbed {
		display: flex;
		align-items: baseline;
		/* A paragraph's indent is inherited by every flex item, and would push
		   the words at the right edge in from it. */
		text-indent: 0;
	}

	.tab-right {
		text-align: right;
	}

	/* The last paragraph's space would only push the area's own bottom down. */
	.paras {
		display: block;
	}

	.para {
		display: block;
		white-space: pre-wrap;
	}

	.para:last-child {
		margin-bottom: 0 !important;
	}

	.page-number {
		position: absolute;
	}

	/* The separator is an empty element whose glyph comes from CSS, so a
	   template's own stylesheet can say `.page-number .of::before { content:
	   ' of ' }` — or take it away. Written here rather than as a literal " / "
	   in the markup precisely so it can be reached. */
	.page-number .of::before {
		content: ' / ';
		white-space: pre;
	}

	/* Laid over the content it is replacing, inheriting everything: what you
	   type is set in the face, size, color and alignment it will print in.
	   Transparent, so the words underneath keep the box its measured height —
	   the editor has no height of its own to give it. */
	.inline-editor {
		position: absolute;
		inset: var(--pad-t, 0) var(--pad-r, 0) var(--pad-b, 0) var(--pad-l, 0);
		z-index: 4;
		margin: 0;
		padding: 0;
		border: none;
		background: rgba(255, 255, 255, 0.9);
		box-sizing: border-box;
		resize: none;
		overflow: auto;
		overscroll-behavior: contain;
		font: inherit;
		color: inherit;
		text-align: inherit;
		letter-spacing: inherit;
		line-height: inherit;
		outline: var(--line-thick) solid var(--accent);
		/* The box is `touch-action: none` so it can be dragged; the editor inside
		   it has to hand scrolling and text selection back. */
		touch-action: auto;
	}

	/* The words under the editor would show through it and double every glyph. */
	.content.being-edited {
		visibility: hidden;
	}

	/* The area's own name, standing in for content it has not got. Italic and
	   in the accent, so it cannot be mistaken for content whatever color the
	   area sets; everything else about it — face, size, weight, alignment — is
	   the area's own, so it shows where the area is and how big what lands in
	   it will be. Drawn only where `interactive` is set, so nothing on paper
	   reaches this rule. */
	/* The page margins. The bounds' weight, solid, in the accent's inverse —
	   the colour furthest from the areas' outlines, which are the accent — so a
	   margin is never taken for an area. Screen only: drawn only where
	   `interactive` is set. */
	.margin-guide {
		position: absolute;
		pointer-events: none;
		/* Solid, and an inset shadow rather than an outline: an outline is
		   rounded to whole pixels of the zoomed card, and doubled at 200%. */
		box-shadow: inset 0 0 0 var(--line) color-mix(in srgb, var(--accent-inverse) 55%, transparent);
	}

	/* The page's fold: a dot-dash line just outside the trim and any bleed,
	   the margin guide's color — it is a guide, and toggles with them. The
	   SVG is a hair wide and centred on the line, with the stroke left to
	   spill out of it. */
	.fold-guide {
		position: absolute;
		top: 0;
		width: 2px;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.fold-guide line {
		stroke: color-mix(in srgb, var(--accent-inverse) 80%, transparent);
		stroke-width: var(--line);
		stroke-dasharray: var(--line) calc(var(--line) * 3) calc(var(--line) * 8) calc(var(--line) * 3);
	}

	.fold-guide.left {
		left: calc(-1 * var(--fold-off, 0mm) - 4px * var(--ui-scale, 1) - 1px);
	}

	.fold-guide.right {
		right: calc(-1 * var(--fold-off, 0mm) - 4px * var(--ui-scale, 1) - 1px);
	}

	/* The stage's grid, under the trim and everything in it. Positioned from
	   the card's own corner, bleed included, which is where the grid is
	   measured from. */
	.underlay {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		line-height: 0;
	}

	/* The area a picture carried out of the Images bar would land in. Set by
	   ImagesPanel as an attribute, so the card's own class handling cannot
	   take it off mid-drag. */
	.area:global([data-image-target]) {
		outline: calc(2px * var(--ui-scale, 1)) solid var(--accent);
		outline-offset: calc(1px * var(--ui-scale, 1));
		background-color: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	/* A `%%name%%` no column answers to, in the editor: underlined in the
	   wavy red a spelling mistake wears, which is what it usually is. */
	.content :global(.unknown-placeholder) {
		text-decoration: underline wavy #d92d20;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
	}

	/* Editor chrome standing in for a value: selecting it would copy a column
	   name that is not on the card. */
	.placeholder {
		color: var(--accent);
		font-style: italic;
		opacity: 0.7;
		user-select: none;
	}

	/* Media has no flow height of its own, so the box's declared height is the
	   frame, and `cover` crops inside it rather than spilling onto the card. */
	.media {
		display: block;
		width: 100%;
		overflow: hidden;
	}

	.media :global(svg),
	.media img {
		display: block;
		width: 100%;
		height: 100%;
	}

	.content :global(p:first-child),
	.content :global(h1:first-child),
	.content :global(h2:first-child),
	.content :global(h3:first-child) {
		margin-top: 0;
	}

	.area.interactive {
		cursor: move;
		touch-action: none;
	}

	/* Zoom and pan: the areas hand a finger back to the page, which scrolls
	   under it and pinches under two, instead of holding it for a drag. The
	   handles keep their own touch-action: none, and so still drag. */
	.card.panning .area {
		cursor: grab;
		touch-action: pan-x pan-y;
	}

	/* A link in a Markdown body is a link on paper: it says where to go, it does
	   not go there. In the editor it was live, so clicking a word to select the
	   area it is in navigated away from the app instead — and the app is the
	   only place the unsaved design exists. Screen only and editor only: the
	   print root and the lightbox render the same DOM without `editing`, and
	   nothing on paper has pointer events to take away. */
	.card.editing :global(.content a) {
		pointer-events: none;
		cursor: inherit;
	}

	/* `--mark` is what you see, `--reach` is how far past it the pointer counts.
	   Both are in screen pixels: multiplying by `--ui-scale` undoes the card's
	   own zoom, so a handle is the same size to the hand at 40% as at 200%. */
	.handle,
	.pivot,
	.lever {
		--mark: calc(var(--handle) * var(--ui-scale, 1));
		--reach: calc(8px * var(--ui-scale, 1));
		position: absolute;
		width: var(--mark);
		height: var(--mark);
		/* No fill: a handle sits on top of the content it is there to resize, and a
		   white square hides the very edge you are trying to place. The trade-off
		   is that the outline is all there is to see, so it carries the weight on
		   a dark background image where a white square used to stand out. */
		background: transparent;
		/* An inset shadow, not a border: a border is rounded to whole pixels of
		   the card's zoomed frame, so at 200% a half-pixel border came out two
		   screen pixels thick. A shadow keeps the fraction. */
		border: none;
		box-shadow: inset 0 0 0 var(--line, 1px) var(--accent);
		/* 2px on screen, whatever the zoom — undone like the size is. The app's
		   button radius, taken in the card's own frame, was scaled with the page:
		   at 400% the corners met in the middle and a square handle read as a
		   dot. The pivot and the lever set their own shapes below. */
		border-radius: calc(2px * var(--ui-scale, 1));
		box-sizing: border-box;
		z-index: 3;
		touch-action: none;
	}

	/* The target, as opposed to the mark. A transparent box-shadow looks like it
	   grows a handle but is never hit-tested, so the target used to be the square
	   and nothing more. A pseudo-element is hit-tested, and it costs no layout. */
	.handle::before,
	.pivot::before,
	.lever::before {
		content: '';
		position: absolute;
		inset: calc(-1 * var(--reach));
	}

	/* A crosshair, which is what a point is drawn as — and, more to the point, not
	   a circle: the lever's knob sits a few pixels away and does something else
	   entirely, so the two marks have to be told apart at a glance rather than by
	   remembering that the further one turns the box. Centred on its own
	   coordinates by the negative margin. Dragging it moves the point the box
	   turns about; turning is the lever. */
	.pivot {
		--mark: calc(15px * var(--ui-scale, 1));
		margin: calc(var(--mark) / -2) 0 0 calc(var(--mark) / -2);
		border: none;
		border-radius: 0;
		box-shadow: none;
		cursor: move;
	}

	/* The lever: a knob on a short arm off the pivot, which is what you swing to
	   turn the box. It hangs off the pivot rather than off the box edge so it
	   travels with the point the rotation is actually about, and being at arm's
	   length is what gives the drag an angle to measure from the first pixel.
	   Both it and the arm rotate with the box, because they are inside it.

	   To the right of the pivot, not below it. The arm used to run downward,
	   straight at the south handle and the two corners either side of it, and an
	   area is usually wider than it is tall — so on the axis it had least room
	   the knob sat on top of the handles you resize with, and grabbing the
	   bottom edge of a shallow area turned it instead. Rightward the arm has the
	   long axis to itself and only the east handle to clear. */
	.lever {
		--arm: calc(30px * var(--ui-scale, 1));
		--mark: calc(11px * var(--ui-scale, 1));
		margin: calc(var(--mark) / -2) 0 0 calc(var(--arm) - var(--mark) / 2);
		border-radius: 50%;
		cursor: grab;
	}

	.lever:active {
		cursor: grabbing;
	}

	/* Drawn as one SVG scaled whole with the mark, rather than as gradients.
	   Gradients with hard stops a fraction of a pixel apart — the arms and the
	   ring were each one --line wide, in the card's own zoomed pixels — are
	   rounded differently at every zoom, so the ring came out a different
	   thickness and shape at 50% than at 200%. A viewBox is 15 units across
	   whatever the zoom, and a stroke of one unit is one screen pixel. */
	.pivot-mark {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		fill: none;
		stroke: var(--accent);
		stroke-width: 1;
	}

	/* The arm is drawn, not grabbed. It runs from the knob back to the pivot, so
	   leaving it hit-testable put a lever-shaped hole over the pivot and the point
	   the box turns about could never be picked up. */
	.lever::after {
		content: '';
		position: absolute;
		top: calc(50% - 1.5 * var(--line, 1px));
		right: 100%;
		/* A gradient in a taller box, not a box one --line high: a box's edges
		   are snapped to whole pixels of the card's own zoomed frame, so at 200%
		   a half-pixel box painted two screen pixels thick. A gradient keeps the
		   fraction. */
		height: calc(3 * var(--line, 1px));
		width: var(--arm);
		background: linear-gradient(var(--accent), var(--accent)) center / 100% var(--line, 1px) no-repeat;
		pointer-events: none;
	}

	/* Above the resize handles. The pivot can be moved onto an edge or a corner
	   where a handle already sits, and between them these two are the only way to
	   turn a box — where resizing has eight other places to be grabbed from. */
	.lever {
		z-index: 4;
	}

	/* And the pivot above the lever: their reaches overlap near the pivot, and
	   the one you mean there is always the pivot — the lever has its knob. */
	.pivot {
		z-index: 5;
	}

	/* Except on an area too short for the pivot to clear the top and bottom
	   handles, where the order above turns round and resizing wins. On a
	   shallow line of type the pivot's reach covered the middle of both edges,
	   so grabbing the edge to make the area taller moved the pivot instead —
	   and a short area is exactly the one you most often want taller. Turning
	   still has the lever, whose knob sits out to the side clear of the N and S
	   handles, and the pivot can still be placed exactly from the bar. */
	.area.cramped .handle {
		z-index: 6;
	}

	/* Fingers are not mice: the marks stay small enough to see past, and the
	   targets grow to something you can actually land on. */
	@media (pointer: coarse) {
		/* The mark shrinks and the reach grows by the same amount, so the target
		   stays 48px for a handle and 44px for the pivot — what it was when the
		   marks were 20px and 16px. A finger covers the thing it is dragging, so
		   the less of it the mark takes up the better, and the target is the
		   ::before, which costs no layout and does not have to be seen. */
		.card {
			--handle: 10px;
		}

		.handle {
			--reach: calc(19px * var(--ui-scale, 1));
		}

		.pivot {
			--mark: calc(11px * var(--ui-scale, 1));
			--reach: calc(20px * var(--ui-scale, 1));
		}

		/* The rotation control used to be left out of this block entirely, which
		   is why it could not be worked on a phone: it kept the fine-pointer 8px
		   reach, on a mark floating outside the box. */
		.lever {
			--arm: calc(34px * var(--ui-scale, 1));
			--mark: calc(10px * var(--ui-scale, 1));
			--reach: calc(19px * var(--ui-scale, 1));
		}
	}

	/* The anchor corner's handle: rounded like the rest, with a ring inside
	   it — the corner the text is set from, which a resize from any other
	   handle leaves where it is. It used to be told apart by square corners
	   alone, which at 14px read as a rendering quirk; with the ring to say it,
	   the corners went back to matching the other seven. A ring, not a cross:
	   a cross is the pivot's mark, a point to turn about, and two crosshairs
	   on one area said the same thing twice.

	   An SVG for the same reason as the pivot's: a ring of gradients a
	   fraction of a pixel wide comes out a different weight at every zoom. The
	   viewBox is the fine-pointer handle's 14px, so a stroke of one unit is one
	   screen pixel; the coarse handle is 10px and makes up the difference. */
	.anchor-mark {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
		fill: none;
		stroke: var(--accent);
		stroke-width: 1;
	}

	@media (pointer: coarse) {
		.anchor-mark {
			stroke-width: 1.4;
		}
	}

	.h-nw { top: calc(var(--mark) / -2); left: calc(var(--mark) / -2); cursor: nwse-resize; }
	.h-n { top: calc(var(--mark) / -2); left: calc(50% - var(--mark) / 2); cursor: ns-resize; }
	.h-ne { top: calc(var(--mark) / -2); right: calc(var(--mark) / -2); cursor: nesw-resize; }
	.h-e { top: calc(50% - var(--mark) / 2); right: calc(var(--mark) / -2); cursor: ew-resize; }
	.h-se { bottom: calc(var(--mark) / -2); right: calc(var(--mark) / -2); cursor: nwse-resize; }
	.h-s { bottom: calc(var(--mark) / -2); left: calc(50% - var(--mark) / 2); cursor: ns-resize; }
	.h-sw { bottom: calc(var(--mark) / -2); left: calc(var(--mark) / -2); cursor: nesw-resize; }
	.h-w { top: calc(50% - var(--mark) / 2); left: calc(var(--mark) / -2); cursor: ew-resize; }

	/**
	 * A mark is two ticks, each lying on one of the trim lines and running
	 * outward into the bleed — not an L of borders around a corner box, which
	 * is what these were. The difference is the gap: a tick stops 1mm short of
	 * the corner along its own direction, so nothing touches the artwork. A
	 * mark that meets the trim corner cannot be told apart from a rule the
	 * design meant to have, and it is exactly the corner a guillotine operator
	 * is lining up on.
	 */
	.crop-marks .mark {
		position: absolute;
		width: var(--bleed);
		height: var(--bleed);
	}

	.crop-marks .mark::before,
	.crop-marks .mark::after {
		content: '';
		position: absolute;
		background: #000;
	}

	/* Along the vertical trim line, and along the horizontal one. `max` because
	   a bleed thinner than the gap has no room for a mark at all. */
	.crop-marks .mark::before {
		width: 0.2mm;
		height: max(0mm, calc(var(--bleed) - var(--crop-gap)));
	}

	.crop-marks .mark::after {
		height: 0.2mm;
		width: max(0mm, calc(var(--bleed) - var(--crop-gap)));
	}

	.crop-marks .tl { top: 0; left: 0; }
	.crop-marks .tl::before { top: 0; right: 0; }
	.crop-marks .tl::after { left: 0; bottom: 0; }

	.crop-marks .tr { top: 0; right: 0; }
	.crop-marks .tr::before { top: 0; left: 0; }
	.crop-marks .tr::after { right: 0; bottom: 0; }

	.crop-marks .bl { bottom: 0; left: 0; }
	.crop-marks .bl::before { bottom: 0; right: 0; }
	.crop-marks .bl::after { left: 0; top: 0; }

	.crop-marks .br { bottom: 0; right: 0; }
	.crop-marks .br::before { bottom: 0; left: 0; }
	.crop-marks .br::after { right: 0; top: 0; }

	@media screen {
		/* A family that has not arrived draws in the system stack, which looks
		   exactly like a font that never applied. The pulse says "wait" rather
		   than letting a slow font read as a broken one. Screen only, and off
		   entirely for anyone who has asked for less motion. */
		@media (prefers-reduced-motion: no-preference) {
			.area.font-loading .content {
				animation: font-waiting 1.1s ease-in-out infinite;
			}
		}

		@keyframes font-waiting {
			0%,
			100% {
				opacity: 1;
			}
			50% {
				opacity: 0.45;
			}
		}

		/* Four things want to draw on one box and there are two pseudo-elements,
		   so the selection moved to an `outline` on the box itself — identical to
		   look at, costs no layout, and leaves ::after for the bounds and ::before
		   for the padding guide. It also means a locked or grouped box keeps its
		   state color while selected, instead of the blue overwriting it.

		   Every weight here is multiplied by --ui-scale. Screen furniture lives
		   inside the scaled card, so a plain 1px line is 0.6px at 64% and 2px at
		   200%: the marks have to be drawn against the zoom to stay the size they
		   were designed at.

		   Both come out exact. Anything with a width and a height — a handle, a
		   badge, the overflow corner — is sized against --ui-scale; every line is
		   an SVG stroke rather than a border, because stroke widths are not
		   quantised to whole device pixels the way border widths are. See the
		   .chrome rules below. */
		/* Every line on a card is one of these: an SVG rect whose stroke is set in
		   var(--line), which is 1px divided by the zoom. Stroke widths are not
		   quantised the way border widths are — a stroke of 0.5 is drawn as half a
		   pixel rather than rounded up to one — so the line comes out the same
		   thickness on screen at any scale. Dashes are expressed in --line too, or
		   the pattern would breathe while the weight held still. */
		.chrome {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			/* The stroke straddles the edge it is drawn on, so half of it is
			   outside the rect and must not be clipped away. */
			overflow: visible;
			pointer-events: none;
			z-index: 2;
		}

		.chrome rect,
		.chrome line {
			fill: none;
			stroke-width: var(--line);
		}

		.bounds rect,
		.bounds line {
			stroke: var(--bounds-color, color-mix(in srgb, var(--accent) 45%, transparent));
			stroke-dasharray: calc(var(--line) * 3) calc(var(--line) * 3);
		}


		/* A locked *design* is not a box that happens to be locked: nothing on the
		   card can be moved, so nothing on it is worth coloring for a reason. The
		   whole set of bounds goes grey — one flat statement that the card is not
		   currently yours to push around — and the padlock over the top edge says
		   why. The rule is last of the three because it has to beat both. */

		/* A locked box cannot be moved, and a grouped one moves with others: both
		   are reasons a drag will not do what you expect, so they color the
		   bounds. Locked wins when a box is both — it is the stronger refusal.
		   The dash is coarser as well as red, because the overflow corner is
		   already red and two reds a millimetre apart are one red. */
		.area.grouped {
			--bounds-color: rgba(124, 58, 237, 0.75);
		}

		.area.locked {
			--bounds-color: rgba(180, 35, 24, 0.8);
		}

		.area.locked .bounds rect,
		.area.locked .bounds line {
			stroke-width: var(--line-thick);
			stroke-dasharray: calc(var(--line) * 5) calc(var(--line) * 3);
		}

		.selection rect,
		.selection line {
			stroke: var(--accent);
		}

		.card.frozen .area {
			--bounds-color: rgba(0, 0, 0, 0.32);
		}

		.card.frozen .area.locked .bounds rect,
		.card.frozen .area.locked .bounds line {
			stroke-width: var(--line);
			stroke-dasharray: calc(var(--line) * 3) calc(var(--line) * 3);
		}

		.card.frozen .selection rect,
		.card.frozen .selection line {
			stroke: rgba(0, 0, 0, 0.5);
		}

		/* An area's edge on the fold: dot and dash, where its other sides are
		   dashes; selected, the dash grows, so the fold still reads against the
		   solid selection. After every dash it overrides, frozen card included. */
		/* Its dash the same length as the dashes beside it, so the dot is the
		   one difference: 3 on a bound, 5 on a locked one's coarser dash. */
		.bounds line.fold,
		.card.frozen .area.locked .bounds line.fold {
			stroke-dasharray: var(--line) calc(var(--line) * 2) calc(var(--line) * 3) calc(var(--line) * 2);
		}

		.area.locked .bounds line.fold {
			stroke-dasharray: var(--line) calc(var(--line) * 2) calc(var(--line) * 5) calc(var(--line) * 2);
		}

		.selection line.fold {
			stroke-dasharray: var(--line) calc(var(--line) * 2) calc(var(--line) * 10) calc(var(--line) * 2);
		}

		/* Positioned by the padding the box was given, so the guide moves with it
		   without anything having to convert millimetres to pixels. */
		/* Sized by subtraction, not by `auto`: for an SVG, auto is not "whatever
		   the insets leave" but the default replaced size of 300 × 150 pixels,
		   which drew this guide as a rectangle far bigger than the area. */
		.pad {
			inset: var(--pad-t, 0) var(--pad-r, 0) var(--pad-b, 0) var(--pad-l, 0);
			width: calc(100% - var(--pad-l, 0mm) - var(--pad-r, 0mm));
			height: calc(100% - var(--pad-t, 0mm) - var(--pad-b, 0mm));
		}

		.pad rect {
			stroke: rgba(8, 145, 178, 0.8);
			stroke-dasharray: calc(var(--line) * 2) calc(var(--line) * 2);
		}

		/* The column gaps: dotted — a dash one line long, round-capped into a
		   dot — so they read as a guide inside the area rather than as another
		   edge of it. In the bounds' color, a shade firmer, so they show beside
		   the dashed bounds without matching them. */
		.gaps line {
			stroke: var(--bounds-color, color-mix(in srgb, var(--accent) 60%, transparent));
			stroke-linecap: round;
			stroke-dasharray: 0 calc(var(--line) * 3);
		}

		/* Where a grown area's bottom was set. Zero high and positioned by the
		   declared height, so it sits exactly on that edge whatever the zoom. */
		/* One line's weight tall, not 0: an SVG with a zero height is not drawn
		   at all — the spec disables rendering for it — which is how this line
		   was in the page and never on the screen. */
		.original-edge {
			inset: auto 0;
			height: var(--line);
		}

		/* Where a clip would have cut, on an area that grows instead: thin, in the
		   bounds' own color, but with more than twice the gap between dashes —
		   the outline the area was given, and plainly not one of its edges. */
		.original-edge line {
			stroke: var(--bounds-color, color-mix(in srgb, var(--accent) 45%, transparent));
			stroke-width: var(--line);
			stroke-dasharray: calc(var(--line) * 3) calc(var(--line) * 7);
		}

		/* On a selected area the bound is not drawn — the selection is — but the
		   trim line still is, in the selection's blue so it belongs to it. */
		.area.selected .original-edge line {
			stroke: var(--accent);
		}

		/* The line the words are cut on: dashed, the way a cut line is drawn on
		   anything meant to be cut, and in the same rhythm as the bound it sits on
		   so the two read as one language. Heavier and red, because this edge is
		   doing something the other three are not. */
		.cut-line line {
			stroke: #b42318;
			stroke-width: var(--line-thick);
			stroke-dasharray: calc(var(--line) * 3) calc(var(--line) * 3);
		}

		/* The same badge as the others — same size and radius — sitting astride
		   the line rather than above it, so the shears read as being *on* the cut
		   they are making. Hollow, unlike every other mark here: a solid red chip
		   at the corner was the heaviest thing on a card whose whole point is the
		   artwork, and the line beside it is already carrying the warning. */
		.overflow-mark {
			position: absolute;
			top: 100%;
			left: 100%;
			/* Half its own height up, so the middle of it lands on the bottom
			   edge — the blade meeting the paper. */
			margin: calc(var(--badge) / -2) 0 0 calc(4px * var(--ui-scale, 1));
			display: grid;
			place-items: center;
			width: var(--badge);
			height: var(--badge);
			box-sizing: border-box;
			border-radius: var(--badge-radius);
			border: none;
			box-shadow: inset 0 0 0 var(--line) #b42318;
			background: transparent;
			color: #b42318;
			padding: 0;
			font: inherit;
			pointer-events: auto;
			cursor: pointer;
			z-index: 3;
		}

		/* The cut not made: the same shears in a faint blue, the way a control
		   that is off is drawn, beside the trim line of an area that has grown. */
		.overflow-mark.offered {
			box-shadow: inset 0 0 0 var(--line) color-mix(in srgb, var(--accent) 45%, transparent);
			color: color-mix(in srgb, var(--accent) 60%, transparent);
		}

		/* In line with the badges above them, and below the last of them where
		   the edge they mark is higher than the column is long: on a shallow
		   area the shears landed on the badges. They were moved a column further
		   out for that, which put them out of line with every other mark. */
		.overflow-mark {
			top: max(
				var(--edge, 100%),
				calc(var(--stack, 0) * (var(--badge) + 2px * var(--ui-scale, 1)) + var(--badge) / 2)
			);
		}

		.overflow-mark:hover:not(:disabled) {
			background: #fff;
		}

		.overflow-mark.offered:hover:not(:disabled) {
			box-shadow: inset 0 0 0 var(--line) var(--accent);
			color: var(--accent);
		}

		.overflow-mark:disabled {
			cursor: help;
		}

		/* Clear of the box, not straddling it: a badge sitting on the corner
		   covered the content it was annotating and fought the corner handle for
		   the same pixels. The column hangs to the right of the edge instead. */
		.badges {
			position: absolute;
			top: 0;
			left: 100%;
			margin-left: calc(4px * var(--ui-scale, 1));
			display: flex;
			flex-direction: column;
			gap: calc(2px * var(--ui-scale, 1));
			/* Above every handle, the pivot and the lever: the top corner handles'
			   reach extends past the box to where the first badge sits, and took
			   the press meant for it. The column itself passes clicks through, so
			   this only ever gives the badges themselves priority. */
			z-index: 7;
			/* The column is click-through so a drag started beside the box still
			   reaches it; the badges themselves are not, or their title — the only
			   thing that says what they mean — could never be hovered. */
			pointer-events: none;
		}

		/* The anchor's badges at the top-left, hanging off the left edge. A row,
		   not a column: an area both tied and moored keeps its buoy in the
		   corner, where it sits on every area others follow, and wears the tie
		   to the left of it — stacked, the buoy dropped a badge down the edge
		   whenever the area happened to follow another. */
		.badges.tie {
			left: auto;
			right: 100%;
			margin: 0 calc(4px * var(--ui-scale, 1)) 0 0;
			flex-direction: row;
		}

		/* Quieter than the blue chrome around it. A badge is an annotation, not a
		   control: it says why the box will not do what you asked, and it should
		   not read as loudly as the thing you are dragging. */
		.badge {
			display: grid;
			place-items: center;
			width: var(--badge);
			height: var(--badge);
			/* Or the border is added to the width, and a badge drawn against the
			   zoom would hold its size everywhere except its own edges. */
			box-sizing: border-box;
			border-radius: var(--badge-radius);
			background: #fff;
			/* The edge is an inset shadow, like the handles', and for the same
			   reason: a border is rounded to whole pixels of the zoomed card, and
			   came out twice as heavy at 200%. */
			--edge: #c4c4c4;
			border: none;
			box-shadow: inset 0 0 0 var(--line) var(--edge);
			color: #767676;
			pointer-events: auto;
			cursor: help;
		}

		.badge:hover {
			--edge: #767676;
			color: #333;
		}

		/* A selected area's badges take the color of its own bounds. The column
		   of them sits a few pixels off the edge of the box they annotate, and in
		   a flat grey they read as belonging to the card rather than to the area —
		   which matters most when several areas are close enough for their badges
		   to be nearer a neighbour's edge than their own. */
		.area.selected .badge {
			--edge: var(--bounds-color, var(--accent));
			color: var(--bounds-color, var(--accent));
		}

		/* Something moved that you were not watching. Long enough to catch out of
		   the corner of the eye, short enough not to become part of the drawing —
		   and off entirely for anyone who has asked for less motion, who gets the
		   status line saying what happened instead. */
		@media (prefers-reduced-motion: no-preference) {
			.area.flashing {
				animation: found 900ms ease-out;
			}

			/* Says where a held picture will land. Screen only, like every other
			   mark on this card, and drawn against the zoom so it is the same
			   weight at 50% as at 200%. */
			.area.dropping {
				box-shadow: 0 0 0 calc(2px * var(--ui-scale, 1)) color-mix(in srgb, var(--accent) 90%, transparent);
				background-color: color-mix(in srgb, var(--accent) 8%, transparent);
			}
		}

		@keyframes found {
			0%,
			70% {
				box-shadow: 0 0 0 calc(3px * var(--ui-scale, 1)) color-mix(in srgb, var(--accent) 55%, transparent);
				background-color: color-mix(in srgb, var(--accent) 18%, transparent);
			}
			100% {
				box-shadow: 0 0 0 calc(3px * var(--ui-scale, 1)) color-mix(in srgb, var(--accent) 0%, transparent);
				background-color: color-mix(in srgb, var(--accent) 0%, transparent);
			}
		}

		/* A badge that is also a button. Reset rather than restyled: it inherits
		   everything from .badge above and only has to stop looking like a
		   browser's idea of a button. */
		button.badge {
			padding: 0;
			font: inherit;
			cursor: pointer;
		}

		button.badge:disabled {
			cursor: help;
		}

		/* The other end of a tie that is selected — the area this one follows, and
		   the areas that follow it. The *mark* goes blue and nothing else does:
		   these badges belong to areas you have not selected, and a filled badge
		   on an unselected area reads as a second selection. A coloured glyph on
		   the card's own quiet badge is enough to find it. */
		.badge.lit {
			color: var(--accent);
		}

		/* The exception, on the selected area itself: what is moored to it is
		   filled. That one is the hub of the relationship the other badges are
		   only pointing at, and it is on the area you already have. */
		.area.selected .badge.moored {
			background: var(--accent-tint);
		}

		/* Further down the same chain — what hangs off what follows this area,
		   and on to the end of it. The same blue as the mark above, at half its
		   strength: all of them move when the selected area moves, so all of them
		   are marked, but the end you are holding has to be the one that stands
		   out. Weaker rather than a different color, because this is the same
		   relationship at one remove and not another kind of tie. */
		.badge.lit-edge {
			color: color-mix(in srgb, var(--accent) 45%, transparent);
		}

		/* Icon takes a px size, which is inside the card's transform like
		   everything else here, so the glyph is overridden against the zoom too —
		   otherwise the badge would hold its size and its contents would not. */
		.badge :global(svg),
		.overflow-mark :global(svg) {
			width: calc(var(--badge) * 0.7);
			height: calc(var(--badge) * 0.7);
		}

		/* Over the whole trim and out past it, since a badge hangs outside its
		   area and an area can hang off the page. Dotted — round caps on dashes
		   of nothing — and walking from the tie toward the buoy, the way the
		   relationship runs, whichever of the two is pointed at. */
		.threads {
			inset: 0;
			width: 100%;
			height: 100%;
			overflow: visible;
			z-index: 6;
		}

		.threads path {
			fill: none;
			stroke: var(--accent);
			stroke-width: calc(2 * var(--line));
			stroke-linecap: round;
			stroke-dasharray: 0 calc(5 * var(--line));
		}

		@media (prefers-reduced-motion: no-preference) {
			.threads path {
				animation: walk 600ms linear infinite;
			}
		}

		@keyframes walk {
			to {
				stroke-dashoffset: calc(-10 * var(--line));
			}
		}

		/* Three lines wide with the line drawn down the middle of it, rather than
		   a box one line wide: a box is rounded to whole pixels of the zoomed
		   card, so a guide was twice the weight of the bounds at 200%. The margin
		   centres the drawn line where the box's own edge used to be. */
		.guide {
			position: absolute;
			background: linear-gradient(var(--accent-inverse), var(--accent-inverse)) center / 100% 100% no-repeat;
			pointer-events: none;
			z-index: 4;
		}

		.guide.vertical { top: 0; bottom: 0; width: calc(3 * var(--line)); margin-left: calc(-1 * var(--line)); background-size: var(--line) 100%; }
		.guide.horizontal { left: 0; right: 0; height: calc(3 * var(--line)); margin-top: calc(-1 * var(--line)); background-size: 100% var(--line); }

		/* A gap: a thin line in the guides' colour, its number in a chip at the
		   middle, sized against the zoom like every other mark on the card. */
		.spacing {
			position: absolute;
			pointer-events: none;
			z-index: 4;
			display: flex;
			align-items: center;
			justify-content: center;
			color: var(--accent-inverse);
		}

		.spacing.across { height: 0; border-top: var(--line) dashed currentColor; }
		.spacing.down { width: 0; border-left: var(--line) dashed currentColor; }
		.spacing.equal { border-style: solid; }

		.spacing-label {
			font: 600 calc(0.625rem * var(--ui-scale)) / 1 system-ui, sans-serif;
			font-variant-numeric: tabular-nums;
			padding: calc(2px * var(--ui-scale)) calc(4px * var(--ui-scale));
			border-radius: calc(3px * var(--ui-scale));
			background: var(--accent-inverse);
			color: #fff;
			white-space: nowrap;
		}
	}

	/* The overlays are conditional on `bounds` and on being interactive, neither
	   of which the print root passes, so they are not in the DOM on paper. Said
	   again here because they are elements now rather than pseudo-elements inside
	   @media screen: they no longer fail safe by construction, and a line on the
	   paper is a printing error rather than a cosmetic one. */
	@media print {
		.chrome {
			display: none !important;
		}
	}
</style>
