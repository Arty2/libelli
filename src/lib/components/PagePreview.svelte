<script lang="ts">
	import { flushSync, tick } from 'svelte';
	import Card from './Card.svelte';
	import type { Theme } from '$lib/theme';
	import Icon from './Icon.svelte';
	import { isDark } from '$lib/color';
	import { SHORTCUTS, withKey } from '$lib/keys';
	import MenuSelect, { type MenuItem } from './MenuSelect.svelte';
	import SelectionTools from './SelectionTools.svelte';
	import type { AlignEdge } from '$lib/layout';
	import { takesADrawing, type Arrange } from '$lib/template';
	import { swipe } from '$lib/gestures';
	import { HOLD_MS, TAP_MS, vibrate } from '$lib/haptics';
	import { GRID_MAJOR, GRID_MINOR, actualScale, bleedFor, mmToPx } from '$lib/layout';
	import type { Box, GridStyle, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row: Row | null;
		mapping: Mapping;
		bounds: boolean;
		/** every tie's thread drawn without pointing at it — the Boxes box's dash */
		ties: boolean;
		/** families still arriving, passed through so an area can pulse while it waits */
		loadingFonts?: string[];
		grid: boolean;
		/** the page margins, drawn and snapped to */
		guides: boolean;
		/** the temporary guides a drag shows as it lines up — see Card's `smartGuides` */
		smartGuides: boolean;
		/** ruled lines, or a dot at every intersection */
		gridStyle: GridStyle;
		selectedIds: string[];
		zoom: 'fit' | 'actual' | number;
		/** 1-based position of the previewed row, for the page number */
		pageNumber: number | null;
		/** the theme on screen, glances included — the page's `theme-…` class */
		theme: Theme;
		/** the area being typed into on the card itself, if any */
		editingId?: string | null;
		/** areas hanging off the sheet, in part or entirely, and so cut or unreachable */
		strayIds?: string[];
		/** whether every press on an area is currently adding to or dropping from the selection */
		picking?: boolean;
		/** which row is previewed, and how many there are, for the pager */
		activeRow: number;
		rowCount: number;
		/** every row, for a card's `%%lookup:…%%` */
		rows: readonly Row[];
		onactivate: (index: number) => void;
		/** open the card full screen; the count under the page is the door */
		onlightbox: () => void;
		/** the template's background image, resolved by the app */
		background: string | null;
		/** stored images by name, for the areas whose cells point at one */
		images?: Record<string, string>;
		onselect: (id: string | null, additive?: boolean) => void;
		onchange: (box: Box) => void;
		/** an image file dropped on an area, handed up for the app to store */
		onimagedrop?: (box: Box, file: File) => void;
		/** a picture file let go over the page but no area */
		onimagepagedrop?: (file: File, clientX: number, clientY: number) => void;
		/** forwarded to the card: what a drag is about to do, for the undo label */
		onaction?: (what: string) => void;
		onbounds: (show: boolean, ties: boolean) => void;
		ongrid: (show: boolean) => void;
		/** the margins and the temporary guides, together — the Guides box's three states */
		onguides: (margins: boolean, smart: boolean) => void;
		/** press and hold the Grid toggle: the same grid, drawn the other way */
		ongridstyle: (style: GridStyle) => void;
		onzoom: (zoom: 'fit' | 'actual' | number) => void;
		onnudge: (dx: number, dy: number) => void;
		undoable: boolean;
		redoable: boolean;
		onundo: () => void;
		onredo: () => void;
		onaddbox: () => void;
		onmenu: (id: string, x: number, y: number) => void;
		/** the drag under an open menu has become a drag; see Card's own prop */
		onmenuclose: () => void;
		/** a dialog has the screen: the view keys are not the page's right now */
		modalOpen: boolean;
		/** everything currently chosen; the selection tools appear for two or more */
		selectedBoxes: Box[];
		onalign: (edge: AlignEdge) => void;
		onarrange: (where: Arrange) => void;
		ongroup: () => void;
		onlockselection: () => void;
		onduplicate: () => void;
		ondelete: () => void;
		/** start or stop typing into an area */
		onedit?: (id: string | null) => void;
		/** open the drawing surface for an area */
		ondraw?: (id: string) => void;
		oneditcell?: (id: string) => void;
		/** words typed into the card, forwarded to whoever owns them */
		ontext?: (box: Box, value: string) => void;
		/** bring the areas that are hanging off the sheet back onto it, and only those */
		onrescue?: () => void;
		/** areas to flash, so a move you did not watch happen is still visible */
		flashIds?: string[];
		/** leave Select Multiple */
		onstoppicking?: () => void;
		/** unlock the design, from the band that says it is locked */
		onunlock?: () => void;
		/** lock it again, from the same button while it still shows the open padlock */
		onrelock?: () => void;
	}

	let {
		template,
		row,
		mapping,
		bounds,
		ties,
		loadingFonts = [],
		grid,
		guides,
		smartGuides,
		gridStyle,
		selectedIds,
		zoom,
		pageNumber,
		theme,
		editingId = null,
		strayIds = [],
		picking = false,
		activeRow,
		rowCount,
		rows,
		onactivate,
		onlightbox,
		background,
		images = {},
		onselect,
		onchange,
		onimagedrop,
		onimagepagedrop,
		onaction,
		onbounds,
		ongrid,
		ongridstyle,
		onguides,
		onzoom,
		onnudge,
		undoable,
		redoable,
		onundo,
		onredo,
		onaddbox,
		onmenu,
		onmenuclose,
		modalOpen,
		selectedBoxes,
		onalign,
		onarrange,
		ongroup,
		onlockselection,
		onduplicate,
		ondelete,
		onedit,
		ondraw,
		oneditcell,
		ontext,
		onrescue,
		onstoppicking,
		onunlock,
		onrelock,
		flashIds = []
	}: Props = $props();

	const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2];
	/** What a gesture or a key may zoom to; `fit` can land outside it, a step cannot. */
	const ZOOM_MIN = 0.15;
	const ZOOM_MAX = 4;

	let host = $state<HTMLDivElement | null>(null);
	let hostSize = $state({ w: 0, h: 0 });
	/**
	 * The pager sits under the sheet in the same column, so the height it takes
	 * is height the page cannot have. Measured rather than assumed: it is a row
	 * of text and icons, and it is not there at all when there are no rows.
	 * Its own height never depends on the scale, so reading it back cannot loop.
	 */
	let pagerHeight = $state(0);
	/** must match the `.page` column's gap, which is what separates the two */
	const PAGE_GAP = 10;
	/** the step the pad moves by, cycled 1 -> 5 -> 10; the keyboard has modifiers */
	let padStep = $state(1);
	const PAD_STEPS = [1, GRID_MINOR, 10];

	/**
	 * Nothing to nudge, so no pad. A locked area does not move, and a pad whose
	 * every press is refused is worse than no pad — it reads as a broken control
	 * rather than as a locked area. The lock badge on the area, and the Locked
	 * band over a locked page, are what say why.
	 */
	/**
	 * The area a drawing could be made in, when exactly one is selected and it is
	 * one that holds a picture of its own. A pen beside the page rather than only
	 * in the bar: the bar scrolls sideways on a phone, and drawing is the one
	 * thing you do *to* an area rather than *about* it.
	 */
	const drawTarget = $derived.by(() => {
		if (template.locked || selectedBoxes.length !== 1) return null;
		const box = selectedBoxes[0];
		if (box.locked || !takesADrawing(box.mode) || box.static?.url) return null;
		return box.id;
	});

	const padUsable = $derived(
		selectedBoxes.length > 0 && !template.locked && !selectedBoxes.every((b) => b.locked)
	);

	/**
	 * An anchored area's top is read off another area's bottom, so up and down
	 * on the pad move the Gap between them rather than a Y it does not have —
	 * which is what a nudge does to an anchored area anyway (see `nudgeBox`).
	 * The two keys say so by changing their mark: a stop bar and a triangle,
	 * the bar being the edge of the area this one hangs from, so the key reads
	 * "towards it" and "away from it". It used to be a chain on keys that
	 * refused the press, with a hold to walk up the tie and three taps to break
	 * it — two gestures nobody was taught, standing in for the one thing the
	 * keys could simply do.
	 */
	const verticalTied = $derived(
		selectedBoxes.length > 0 && selectedBoxes.every((b) => !!b.anchor)
	);

	/** Paint order is array order, so "front" is last in the list, not a z-index. */
	const ARRANGEMENTS: Array<{ value: Arrange; icon: string; label: string }> = [
		{ value: 'front', icon: 'bring-to-front', label: 'Bring to Front' },
		{ value: 'forward', icon: 'bring-forward', label: 'Bring Forward' },
		{ value: 'backward', icon: 'send-backward', label: 'Send Backward' },
		{ value: 'back', icon: 'send-to-back', label: 'Send to Back' }
	];

	// A single box knows where it sits in the stack, so the ends can be disabled.
	// Several move as a block and the whole set is always somewhere to go.
	const stackIndex = $derived(
		selectedIds.length === 1 ? template.boxes.findIndex((b) => b.id === selectedIds[0]) : -1
	);
	const atFront = $derived(stackIndex === template.boxes.length - 1);
	const atBack = $derived(stackIndex === 0);
	const cannotArrange = (where: Arrange) =>
		!!template.locked ||
		(stackIndex >= 0 && ((where === 'front' || where === 'forward') ? atFront : atBack));

	const bleed = $derived(bleedFor(template.bleed));
	const outerW = $derived(template.page.w + bleed * 2);
	const outerH = $derived(template.page.h + bleed * 2);


	/**
	 * What Fit *would* be, whether or not that is what the page is at.
	 *
	 * Its own value rather than a branch inside `scale`, because the zoom menu
	 * has to be able to say "43% — Fit" while sitting at 200%. Reading the
	 * current scale there meant the Fit line renamed itself to whatever you had
	 * just zoomed to, and so never once told you what it would do.
	 */
	const fitScale = $derived.by(() => {
		if (!hostSize.w || !hostSize.h) return 1;
		// Just enough room for the shadow and the corner chips. On a phone the
		// stage is the whole screen, so every millimetre of padding is a
		// millimetre of card you cannot see.
		const pad = hostSize.w < 560 ? 16 : 48;
		// The pager is not in the page's column: it is fixed to the stage, and its
		// band is real padding on the viewport, which `contentRect` has already
		// taken out of `hostSize.h`.
		const fit = Math.min((hostSize.w - pad) / mmToPx(outerW), (hostSize.h - pad) / mmToPx(outerH));
		return Math.max(0.15, Math.min(fit, 2));
	});

	/**
	 * Room to pan past the page's edges, once it is zoomed past Fit.
	 *
	 * The toolbars float over the stage, and the scroller's own padding is a
	 * flat 24px, so scrolled to an edge the page's corner sat under undo and
	 * the zoom, which are 48px and more in from it: the one part of the page
	 * you had scrolled there to see was the part you could not. Each toolbar
	 * is cleared by whichever edge it is nearer to — undo's column by the left,
	 * the view toggles and the zoom by the bottom — and each side gets as much
	 * room as its deepest toolbar needs, plus a gap, as a margin on the page.
	 *
	 * A margin rather than more padding on the scroller: Fit is measured off
	 * the scroller's content box, so padding would shrink Fit to make room it
	 * does not need. Fit leaves the page clear of the toolbars on its own — it
	 * is centred, with the corners in the band around it — and only a page
	 * larger than the stage can be scrolled under them. The nudge pad is left
	 * out: it can be dragged anywhere, off whatever it happens to cover.
	 */
	let stage = $state<HTMLDivElement | null>(null);
	let clearance = $state({ top: 0, right: 0, bottom: 0, left: 0 });
	const CLEAR_GAP = 16;

	function measureClearance() {
		if (!stage || !host) return;
		const box = stage.getBoundingClientRect();
		const need = { top: 0, right: 0, bottom: 0, left: 0 };
		for (const el of stage.querySelectorAll<HTMLElement>(':scope > .rail, :scope > .corner, .pager .controls')) {
			const r = el.getBoundingClientRect();
			if (!r.width || !r.height) continue;
			const ways = {
				top: r.bottom - box.top,
				right: box.right - r.left,
				bottom: box.bottom - r.top,
				left: r.right - box.left
			};
			const side = (Object.keys(ways) as (keyof typeof ways)[]).reduce((a, b) => (ways[b] < ways[a] ? b : a));
			need[side] = Math.max(need[side], ways[side] + CLEAR_GAP);
		}
		// The scroller's padding already gives some of it.
		const pad = getComputedStyle(host);
		const next = {
			top: Math.max(0, Math.round(need.top - parseFloat(pad.paddingTop))),
			right: Math.max(0, Math.round(need.right - parseFloat(pad.paddingRight))),
			bottom: Math.max(0, Math.round(need.bottom - parseFloat(pad.paddingBottom))),
			left: Math.max(0, Math.round(need.left - parseFloat(pad.paddingLeft)))
		};
		const was = clearance;
		if (next.top !== was.top || next.right !== was.right || next.bottom !== was.bottom || next.left !== was.left) {
			clearance = next;
		}
	}

	$effect(() => {
		if (!stage) return;
		const node = stage;
		// The toolbars change size with what they offer — the selection's own
		// tools come and go under undo — so they are watched, not read once.
		void selectedIds.length;
		void hostSize;
		const observer = new ResizeObserver(() => measureClearance());
		for (const el of node.querySelectorAll<HTMLElement>(':scope > .rail, :scope > .corner, .pager .controls')) {
			observer.observe(el);
		}
		measureClearance();
		return () => observer.disconnect();
	});

	/**
	 * The zoom at which the paper is its real size here — see `actualScale`.
	 * Read again whenever the window changes, because moving it to another
	 * screen, or zooming the browser, changes what the screen reports.
	 */
	let actual = $state(actualScale({ width: 0, height: 0, ratio: 1 }));

	$effect(() => {
		const read = () =>
			(actual = actualScale({ width: screen.width, height: screen.height, ratio: window.devicePixelRatio || 1 }));
		read();
		window.addEventListener('resize', read);
		return () => window.removeEventListener('resize', read);
	});

	const scale = $derived(typeof zoom === 'number' ? zoom : zoom === 'actual' ? actual.scale : fitScale);

	/** Past Fit, where the page can be larger than the stage — see `clearance`. */
	const zoomedIn = $derived(scale > fitScale + 0.001);

	/**
	 * The zoom menu. Actual is the paper at its real size on this screen,
	 * worked out from what the screen reports about itself; a screen the app
	 * does not know gets the browser's own millimetre, and the title says
	 * which it was.
	 */
	const zoomItems = $derived.by((): MenuItem[] => [
		{ value: 'fit', label: `${Math.round(fitScale * 100)}% — Fit` },
		{
			value: 'actual',
			label: `${Math.round(actual.scale * 100)}% — Actual`,
			title: actual.panel
				? `The paper at its real size, measured for a ${actual.panel}${actual.estimate ? ' — the commonest screen of this resolution, so it may be off' : ''}`
				: 'This screen is not one the app knows, so this is the browser’s own millimetre, which may not match a ruler'
		},
		{ rule: true },
		...(typeof zoom === 'number' && !ZOOM_STEPS.includes(zoom)
			? [{ value: String(zoom), label: `${Math.round(zoom * 100)}%` }]
			: []),
		...ZOOM_STEPS.map((step) => ({ value: String(step), label: `${step * 100}%` }))
	]);

	/**
	 * The grid, as geometry rather than as a background.
	 *
	 * It used to be four `repeating-linear-gradient`s. A repeating gradient is
	 * rasterised as one tile and then repeated, so the tile's width is rounded to
	 * whole device pixels once and that rounding is multiplied by however many
	 * tiles fit: on a 5mm subgrid at most scales the period is fractional, and
	 * the line that should sit at 18.9px landed on the same pixel as the one at
	 * 18.4px. Whole gridlines went missing, and which ones went missing changed
	 * with the zoom — which is exactly what it looked like from the outside.
	 *
	 * Every line is placed here instead, from the same millimetres the boxes use,
	 * and handed to the renderer as one path per weight. Two paths, whatever the
	 * page size, and no rounding between the measurement and the mark.
	 *
	 * Both run from the trim corner, not the sheet corner, and outwards in both
	 * directions: coordinates are measured from the trim edge, so turning bleed
	 * on must not slide the grid sideways under the boxes it is there to measure.
	 */
	/**
	 * Where the grid's own corner falls on the device's pixels. Every mark is
	 * snapped to them, because a line between two device pixels is drawn as
	 * two half-strength ones: the grid read as a grey smear rather than as a
	 * rule, and a round dot under a pixel across as a faint blur. Only the
	 * fraction matters — a whole number of pixels further on is the same grid —
	 * and it is measured, not worked out, because the page is centred in the
	 * stage and scaled inside it, and either can leave it anywhere in a pixel.
	 */
	let gridSvg = $state<SVGSVGElement | null>(null);
	let pixels = $state({ ratio: 1, x: 0, y: 0 });

	function measurePixels() {
		if (!gridSvg) return;
		const ratio = window.devicePixelRatio || 1;
		const r = gridSvg.getBoundingClientRect();
		const frac = (v: number) => v * ratio - Math.floor(v * ratio);
		const next = { ratio, x: frac(r.left), y: frac(r.top) };
		// Set only on a change: the grid is drawn from this, and measuring what
		// was just drawn from it must not draw it again.
		const same = (a: number, b: number) => Math.abs(a - b) < 0.01;
		if (next.ratio !== pixels.ratio || !same(next.x, pixels.x) || !same(next.y, pixels.y)) pixels = next;
	}

	$effect(() => {
		// Whatever moves the sheet inside a pixel: the zoom, the stage's size
		// (the page is centred in it) and the page's own size.
		void gridArt;
		void hostSize;
		measurePixels();
	});

	$effect(() => {
		if (!host || !gridSvg) return;
		const node = host;
		// A scroll is whole device pixels in most browsers, but not at every
		// ratio in every one; and a window dragged to another screen changes
		// the ratio without resizing anything.
		const onScroll = () => measurePixels();
		node.addEventListener('scroll', onScroll, { passive: true });
		const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
		query.addEventListener('change', onScroll);
		return () => {
			node.removeEventListener('scroll', onScroll);
			query.removeEventListener('change', onScroll);
		};
	});

	/** Two decimals of a device pixel keeps the path strings short and loses nothing. */
	const round = (v: number) => Math.round(v * 100) / 100;

	/** Where the lines fall along one axis, in screen px from the sheet corner. */
	function gridTicks(extentMm: number, stepMm: number, originMm: number): number[] {
		const out: number[] = [];
		const first = Math.ceil(-originMm / stepMm);
		const last = Math.floor((extentMm - originMm) / stepMm);
		for (let k = first; k <= last; k++) out.push(mmToPx(originMm + k * stepMm) * scale);
		return out;
	}

	const gridArt = $derived.by(() => {
		if (!grid) return null;
		const { ratio } = pixels;
		const originMm = bleed;
		const w = mmToPx(outerW) * scale;
		const h = mmToPx(outerH) * scale;
		// Device pixels from here on: the viewBox is drawn in them, so a whole
		// number is a pixel edge and a half is a pixel's middle.
		const at = (stepMm: number) => ({
			xs: gridTicks(outerW, stepMm, originMm).map((v) => v * ratio),
			ys: gridTicks(outerH, stepMm, originMm).map((v) => v * ratio)
		});
		const major = at(GRID_MAJOR);
		const minor = at(GRID_MINOR);
		// A major line is also a minor one; drawing both would double its weight
		// where they coincide, which is the one place the grid must stay quiet.
		const onMajor = new Set([...major.xs, ...major.ys].map((v) => Math.round(v * 100)));
		const notMajor = (v: number) => !onMajor.has(Math.round(v * 100));
		// The pixel a tick falls in, as the edge it starts at in the viewBox.
		const cellX = (v: number) => Math.floor(v + pixels.x) - pixels.x;
		const cellY = (v: number) => Math.floor(v + pixels.y) - pixels.y;
		const base = { w, h, vw: w * ratio, vh: h * ratio };

		if (gridStyle === 'dots') {
			// Squares of whole device pixels, filled rather than stroked: a round
			// dot under a pixel across was antialiased down to a grey that some
			// screens barely showed. One size for every dot, about a CSS pixel —
			// a larger dot at every 10mm was four times the ink of the rest, and
			// on a desktop screen it was the grid that stood out, not the 10mm
			// rhythm. The dots give that rhythm up; the ruled grid keeps it.
			const size = Math.max(1, Math.round(ratio * 0.75));
			// Centred on the tick's pixel: for an even size the square leans a
			// pixel right and down, which no one will ever see.
			const lead = Math.floor((size - 1) / 2);
			const row = minor.ys.map((y) => round(cellY(y) - lead));
			return {
				...base,
				dots: true,
				majorPath: '',
				// Every major tick is a minor one too, so the minor ticks alone
				// are every intersection.
				minorPath: minor.xs
					.map((x) => {
						const left = round(cellX(x) - lead);
						return row.map((top) => `M${left} ${top}h${size}v${size}h-${size}z`).join('');
					})
					.join('')
			};
		}
		// One device pixel wide, down the middle of the pixel the tick falls in.
		const rules = (xs: number[], ys: number[]) =>
			xs.map((x) => `M${round(cellX(x) + 0.5)} 0V${round(base.vh)}`).join('') +
			ys.map((y) => `M0 ${round(cellY(y) + 0.5)}H${round(base.vw)}`).join('');
		return {
			...base,
			dots: false,
			majorPath: rules(major.xs, major.ys),
			minorPath: rules(minor.xs.filter(notMajor), minor.ys.filter(notMajor))
		};
	});

	$effect(() => {
		if (!host) return;
		let frame = 0;
		const observer = new ResizeObserver(([entry]) => {
			const { width: w, height: h } = entry.contentRect;
			// Coalesced to a frame and held to whole pixels: the gutter above is
			// what actually stops the loop, but a resize observer that writes state
			// synchronously on every sub-pixel wobble is a loop waiting for the
			// next reason to start.
			if (Math.abs(w - hostSize.w) < 1 && Math.abs(h - hostSize.h) < 1) return;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => (hostSize = { w, h }));
		});
		observer.observe(host);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	});

	/**
	 * The stage's edges moving under the page. Choosing an area opens its
	 * options above the stage — on a phone a bar a third of the screen tall —
	 * and the stage's top came down by that much, taking the page with it:
	 * the area just tapped near the top slid away down the screen, which read
	 * as the view jumping to the bar. So when an edge moves, the scroll moves
	 * with it and the page stays where it was on screen, as far as there is
	 * scroll to do it with; closing the bar puts it back the same way.
	 *
	 * And where that is not enough — a page with no room to scroll, or an area
	 * already near the bottom — and the chosen area has ended up outside what
	 * can be seen, it is scrolled to: the least distance that shows it, with a
	 * margin, so a tall area shows its top. Only when the stage changes size,
	 * not whenever the selection does: an area dragged off the edge on purpose
	 * stays there.
	 *
	 * Both ways: the bar closing — the area deselected, or a second one
	 * chosen — reveals what was chosen until a moment ago, as the bar opening
	 * reveals what is chosen now.
	 */
	$effect(() => {
		if (!host) return;
		const node = host;
		let last = node.getBoundingClientRect();
		// From before the resize. A stage that grows shortens what can be
		// scrolled, and the browser clamps the scroll back by itself before
		// this hears of it — added to the edge's own move, a page near the
		// bottom went twice as far as the bar it was making up for. Its scroll
		// event even arrives first, in the same frame; so a scroll that
		// landed in the frame of the resize is taken to be that clamp, and the
		// one before it is used.
		let scrolled = { x: node.scrollLeft, y: node.scrollTop };
		let before = scrolled;
		let scrolledAt = 0;
		const onScroll = () => {
			before = scrolled;
			scrolled = { x: node.scrollLeft, y: node.scrollTop };
			scrolledAt = performance.now();
		};
		const observer = new ResizeObserver(() => {
			const now = node.getBoundingClientRect();
			const moved = { x: now.left - last.left, y: now.top - last.top };
			last = now;
			if (moved.x || moved.y) {
				const from = performance.now() - scrolledAt < 20 ? before : scrolled;
				node.scrollLeft = from.x + moved.x;
				node.scrollTop = from.y + moved.y;
			}
			revealSelection(now);
			before = scrolled = { x: node.scrollLeft, y: node.scrollTop };
			scrolledAt = 0;
		});
		node.addEventListener('scroll', onScroll, { passive: true });
		observer.observe(node);
		return () => {
			observer.disconnect();
			node.removeEventListener('scroll', onScroll);
		};
	});

	/** What was chosen until a moment ago, and when it stopped being — see `revealSelection`. */
	let lastChosen: { ids: string[]; until: number } = { ids: [], until: 0 };
	$effect(() => {
		if (selectedIds.length) lastChosen = { ids: [...selectedIds], until: Infinity };
		else if (lastChosen.until === Infinity) lastChosen = { ...lastChosen, until: performance.now() };
	});

	const REVEAL_MARGIN = 16;

	function revealSelection(view: DOMRect) {
		if (!host || pinch.size) return;
		const ids = selectedIds.length
			? selectedIds
			: performance.now() - lastChosen.until < 1000
				? lastChosen.ids.filter((id) => template.boxes.some((b) => b.id === id))
				: [];
		if (!ids.length) return;
		const r = selectionRect(ids);
		if (!r || r.page) return;
		const into = (start: number, size: number, from: number, to: number) => {
			if (size > to - from - 2 * REVEAL_MARGIN || start < from + REVEAL_MARGIN) return start - (from + REVEAL_MARGIN);
			if (start + size > to - REVEAL_MARGIN) return start + size - (to - REVEAL_MARGIN);
			return 0;
		};
		// The visible part: short of the scroller's own bars.
		const right = view.left + host.clientWidth;
		const bottom = view.top + host.clientHeight;
		const dx = r.left + r.w < view.left || r.left > right ? into(r.left, r.w, view.left, right) : 0;
		const dy = r.top + r.h < view.top + REVEAL_MARGIN || r.top > bottom - REVEAL_MARGIN ? into(r.top, r.h, view.top, bottom) : 0;
		if (dx) host.scrollLeft += dx;
		if (dy) host.scrollTop += dy;
	}

	/**
	 * Zooming starts from what is on screen, not from the last number typed: a
	 * step out of `fit` picks up the fitted scale, so the page does not jump.
	 */
	function zoomTo(next: number, at?: { x: number; y: number }) {
		const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
		const rounded = Math.round(clamped * 1000) / 1000;
		if (rounded === scale) return;
		holdSelection(at);
		onzoom(rounded);
	}

	/**
	 * Zooming about the selection. With an area chosen, that area is what is
	 * being looked at, so it stays where it is on screen and the page grows or
	 * shrinks around it — rather than about the top left, where the scroll
	 * offsets happen to hold still, which sent a chosen area off the edge in
	 * two steps of a pinch. With nothing chosen, the paper itself is held.
	 *
	 * The point held still is where the zoom was asked for — the pointer under
	 * a wheel, the middle of a pinch — brought inside the selection if it lies
	 * outside it. Held to the selection's own middle, a wheel over one end of a
	 * long area zoomed about the other end: what was under the pointer slid
	 * away from it. Brought inside, the area still cannot leave: a pointer off
	 * to one side holds the nearest edge still. The keys have no position, and
	 * zoom about the middle.
	 *
	 * Where it was is taken before the scale changes, and put back once the
	 * page has been drawn at the new one (the effect below). A pinch is a
	 * stream of steps faster than a frame, so the first step's position is kept
	 * until one has landed — held to each step's own, the selection would creep
	 * by a rounding error a step. Only where the page can scroll: a page smaller
	 * than the stage is centred in it, and there is nothing to move.
	 */
	type Hold = { x: number; y: number; fx: number; fy: number };
	let held: Hold | null = null;

	/**
	 * The chosen areas' union on screen — or, with nothing chosen, the sheet
	 * itself, so a pinch or a wheel over bare paper zooms about where it
	 * happened rather than about the top left.
	 */
	function selectionRect(ids: string[] = pinchIds ?? selectedIds) {
		if (!host) return null;
		if (!ids.length) {
			const r = host.querySelector<HTMLElement>('.sheet')?.getBoundingClientRect();
			return r ? { left: r.left, top: r.top, w: r.width, h: r.height, page: true } : null;
		}
		const rects = ids
			.map((id) => host!.querySelector<HTMLElement>(`[data-box-id="${CSS.escape(id)}"]`)?.getBoundingClientRect())
			.filter((r): r is DOMRect => !!r && (r.width > 0 || r.height > 0));
		if (!rects.length) return null;
		const left = Math.min(...rects.map((r) => r.left));
		const top = Math.min(...rects.map((r) => r.top));
		return {
			left,
			top,
			w: Math.max(...rects.map((r) => r.right)) - left,
			h: Math.max(...rects.map((r) => r.bottom)) - top,
			page: false
		};
	}

	/**
	 * The point of the selection to hold still: `at`, clamped into it, kept as
	 * a fraction of the selection so the same point can be found again at the
	 * next scale. No `at`, its middle.
	 *
	 * The whole sheet is the one thing not clamped: what is under the fingers
	 * stays under them, even out on the grey past the paper's edge. With no
	 * position as well — the keys — there is nothing to hold, and the page
	 * zooms as it always has.
	 */
	function holdAt(at?: { x: number; y: number }, ids?: string[]): Hold | null {
		const r = selectionRect(ids);
		if (!r || (r.page && !at)) return null;
		const fraction = (v: number | undefined, from: number, size: number) =>
			v === undefined || size === 0
				? 0.5
				: r.page
					? (v - from) / size
					: Math.min(1, Math.max(0, (v - from) / size));
		const fx = fraction(at?.x, r.left, r.w);
		const fy = fraction(at?.y, r.top, r.h);
		return { x: r.left + fx * r.w, y: r.top + fy * r.h, fx, fy };
	}

	function holdSelection(at?: { x: number; y: number }) {
		held ??= holdAt(at);
	}

	/**
	 * Room to scroll, for the length of a gesture. Below Fit, and for a while
	 * past it, the page is no wider than the stage and centred in it: there is
	 * nothing to scroll, so nothing to hold the point under the fingers still
	 * with, and the page grew about its own middle — until it was wide enough
	 * to scroll, when the hold took back everything it had lost at once. That
	 * lurch was the jerk in a pinch from Fit. A transform to make up the
	 * difference was tried, and fails where the scroll is at its end: moving
	 * the page left takes its own width off what can be scrolled, and the
	 * scroll gives back exactly what the transform took.
	 *
	 * So while a pinch or a zooming wheel is going on the page has a stage's
	 * worth of empty margin on every side, and the scroll can always hold.
	 * Taking it on moves nothing: the hold after the step puts the point back
	 * where it was, margin and all. Taking it off at the end does move the
	 * page — below Fit, back to the middle — so that move is played as a short
	 * slide from where it was rather than a jump.
	 */
	let slack = $state(0);
	let settle = $state<{ x: number; y: number; on: boolean } | null>(null);
	let gestureEnd: ReturnType<typeof setTimeout> | undefined;

	function beginGesture() {
		clearTimeout(gestureEnd);
		if (slack || !host || !pageEl) return;
		// Drawn at once and scrolled by however far it moved the page, so that
		// taking the room on is invisible whether or not a step follows.
		const before = pageEl.getBoundingClientRect();
		settle = null;
		slack = Math.ceil(Math.max(host.clientWidth, host.clientHeight));
		flushSync();
		const after = pageEl.getBoundingClientRect();
		host.scrollLeft += after.left - before.left;
		host.scrollTop += after.top - before.top;
	}

	async function endGesture() {
		clearTimeout(gestureEnd);
		if (!slack || !host || !pageEl) return;
		const before = pageEl.getBoundingClientRect();
		const scrolled = { x: host.scrollLeft - slack, y: host.scrollTop - slack };
		slack = 0;
		await tick();
		if (!host || !pageEl) return;
		host.scrollLeft = scrolled.x;
		host.scrollTop = scrolled.y;
		const after = pageEl.getBoundingClientRect();
		const from = { x: before.left - after.left, y: before.top - after.top };
		if (Math.abs(from.x) < 1 && Math.abs(from.y) < 1) return;
		// Drawn where it was, then let go to where it is.
		settle = { ...from, on: false };
		await tick();
		requestAnimationFrame(() => {
			if (settle) settle = { x: 0, y: 0, on: true };
			setTimeout(() => (settle = null), 220);
		});
	}

	let pageEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		void scale;
		if (!held || !host) return;
		// A pinch steers every step back to where the selection was when it
		// began, so a step that fell short is made up by the next rather than
		// kept.
		const was = pinchTarget ?? held;
		held = null;
		const r = selectionRect();
		if (!r) return;
		host.scrollLeft += r.left + was.fx * r.w - was.x;
		host.scrollTop += r.top + was.fy * r.h - was.y;
	});

	const zoomBy = (factor: number, at?: { x: number; y: number }) => zoomTo(scale * factor, at);

	/**
	 * Type size under the pointer, in points.
	 *
	 * A mouse notch is a single fat event and a trackpad is a stream of small
	 * ones, so the deltas are accumulated and spent a point at a time rather than
	 * read one-for-one — otherwise the same flick is one step on one machine and
	 * forty on another. One notch of a mouse wheel is a point; the tally resets
	 * when the pointer moves to another box.
	 */
	const SIZE_NOTCH = 100;
	let sizeTally = 0;
	let sizeTarget: string | null = null;

	function resizeType(event: WheelEvent) {
		if (template.locked) return;
		const under = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-box-id]');
		const id = under?.dataset.boxId;
		if (!id) return;

		if (id !== sizeTarget) {
			sizeTarget = id;
			sizeTally = 0;
		}
		sizeTally -= event.deltaY;
		const steps = Math.trunc(sizeTally / SIZE_NOTCH);
		if (!steps) return;
		sizeTally -= steps * SIZE_NOTCH;

		// The box under the pointer, or the whole selection when it is part of one
		// — the same bargain dragging one of several makes.
		const chosen = selectedIds.includes(id) ? selectedIds : [id];
		for (const box of template.boxes.filter((b) => chosen.includes(b.id) && !b.locked)) {
			// A box with no size of its own inherits the page's; the first step is
			// what gives it one to change.
			const from = box.size ?? template.defaults.size;
			const size = Math.round(Math.max(1, from + steps) * 10) / 10;
			if (size !== box.size) onchange({ ...box, size });
		}
	}

	/**
	 * Pinch. A trackpad pinch and a Ctrl+wheel arrive as the same event, which is
	 * why this is one handler; `preventDefault` is what stops the browser zooming
	 * the whole app around it, and it only works on a non-passive listener, so
	 * this is added by hand rather than as an `onwheel` attribute. Shift held as
	 * well sizes the type under the pointer instead of the page — still
	 * prevented, or the browser would zoom itself underneath it.
	 */
	/**
	 * Fit, and back. The zoom before Fit is remembered as it is left, so a
	 * double tap on the zoom goes out to see the whole page and a second one
	 * comes back to where you were working. With nothing to go back to — Fit
	 * from the start — it goes to the paper's real size, the other named zoom.
	 */
	let beforeFit: number | 'actual' | null = null;
	$effect(() => {
		if (zoom !== 'fit') beforeFit = zoom;
	});

	function toggleFit() {
		if (zoom !== 'fit') onzoom('fit');
		else onzoom(beforeFit ?? 'actual');
	}

	/** When the last zooming wheel arrived — see the Safari gesture below. */
	let lastWheel = -Infinity;

	$effect(() => {
		if (!host) return;
		const node = host;
		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			lastWheel = performance.now();
			if (event.shiftKey) resizeType(event);
			else {
				beginGesture();
				zoomBy(Math.exp(-event.deltaY / 220), { x: event.clientX, y: event.clientY });
				// A wheel has no end of its own: a pause is the end.
				gestureEnd = setTimeout(() => void endGesture(), 250);
			}
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return () => node.removeEventListener('wheel', onWheel);
	});

	/**
	 * Safari's own pinch. It zooms the app from its `gesture*` events whatever
	 * `touch-action` says, so they are refused here. On a touchscreen the pinch
	 * below has already zoomed the page from the pointers; a trackpad in desktop
	 * Safari may send no Ctrl+wheel for its pinch, so there the gesture's own
	 * scale zooms the page — unless a wheel or two fingers just did, which
	 * would zoom it twice.
	 */
	$effect(() => {
		if (!host) return;
		const node = host;
		let from = 1;
		const onStart = (event: Event) => {
			event.preventDefault();
			from = scale;
			beginGesture();
		};
		const onChange = (event: Event) => {
			event.preventDefault();
			if (pinch.size > 0 || performance.now() - lastWheel < 150) return;
			const gesture = event as Event & { scale?: number; clientX?: number; clientY?: number };
			const at = gesture.clientX === undefined || gesture.clientY === undefined ? undefined : { x: gesture.clientX, y: gesture.clientY };
			if (gesture.scale) zoomTo(from * gesture.scale, at);
		};
		const onEnd = (event: Event) => {
			event.preventDefault();
			if (pinch.size === 0) void endGesture();
		};
		node.addEventListener('gesturestart', onStart);
		node.addEventListener('gesturechange', onChange);
		node.addEventListener('gestureend', onEnd);
		return () => {
			node.removeEventListener('gesturestart', onStart);
			node.removeEventListener('gesturechange', onChange);
			node.removeEventListener('gestureend', onEnd);
		};
	});

	/** Two fingers on the page. Tracked by pointer id, so a stray third does nothing. */
	let pinch = new Map<number, { x: number; y: number }>();
	let pinchStart: { spread: number; scale: number } | null = null;
	let pinchFrame = 0;

	const spread = () => {
		const [a, b] = [...pinch.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	};

	/**
	 * The selection as it was before the first finger landed. That finger lands
	 * on something, and pressing an area chooses it — so by the time the second
	 * arrives and it is a pinch, the selection is whatever the first happened to
	 * touch, and the page zoomed about the body text rather than the area that
	 * was chosen. A pinch is a way of looking, not a choice: it zooms about what
	 * was chosen before it, and puts that choice back.
	 */
	let beforeTouch: string[] = [];
	let pinchIds: string[] | null = null;
	let pinchTarget: Hold | null = null;

	function onPinchDown(event: PointerEvent) {
		if (event.pointerType !== 'touch') return;
		if (pinch.size === 0) beforeTouch = [...selectedIds];
		pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch.size === 2) {
			pinchStart = { spread: spread(), scale };
			pinchIds = beforeTouch;
			const [a, b] = [...pinch.values()];
			// Before the room is taken on: the scroll that makes up for it is
			// whole pixels, and a target read after it would carry the half
			// pixel it lost, grown by every step of the zoom.
			pinchTarget = holdAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, beforeTouch);
			beginGesture();
			restoreSelection(beforeTouch);
		}
	}

	/** Choose exactly these again, if the first finger changed what was chosen. */
	function restoreSelection(ids: string[]) {
		if (ids.length === selectedIds.length && ids.every((id) => selectedIds.includes(id))) return;
		onselect(ids[0] ?? null);
		for (const id of ids.slice(1)) onselect(id, true);
	}

	function onPinchMove(event: PointerEvent) {
		if (!pinch.has(event.pointerId)) return;
		pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch.size !== 2 || !pinchStart || pinchStart.spread === 0) return;
		event.preventDefault();
		// One step a frame. A touchscreen reports its fingers faster than the
		// screen draws — 120 times a second on many phones — and every step is
		// a whole page redrawn at a new scale, so two to a frame was work thrown
		// away and a frame missed. The last positions of the frame are the ones
		// used.
		if (pinchFrame) return;
		pinchFrame = requestAnimationFrame(() => {
			pinchFrame = 0;
			if (pinch.size !== 2 || !pinchStart || pinchStart.spread === 0) return;
			const [a, b] = [...pinch.values()];
			zoomTo(pinchStart.scale * (spread() / pinchStart.spread), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
		});
	}

	function onPinchUp(event: PointerEvent) {
		pinch.delete(event.pointerId);
		if (pinch.size < 2 && pinchStart) void endGesture();
		if (pinch.size < 2) pinchStart = null;
		if (pinch.size === 0) {
			pinchIds = null;
			pinchTarget = null;
		}
	}

	/**
	 * The pinch listens in the capture phase, on the way down to whatever was
	 * touched, because an area swallows its own pointer events — without this a
	 * pinch worked on the grey around the page and nowhere on the page itself,
	 * which is most of what there is to pinch on a phone.
	 */
	$effect(() => {
		if (!host) return;
		const node = host;
		node.addEventListener('pointerdown', onPinchDown, true);
		node.addEventListener('pointermove', onPinchMove, true);
		node.addEventListener('pointerup', onPinchUp, true);
		node.addEventListener('pointercancel', onPinchUp, true);
		return () => {
			cancelAnimationFrame(pinchFrame);
			pinchFrame = 0;
			node.removeEventListener('pointerdown', onPinchDown, true);
			node.removeEventListener('pointermove', onPinchMove, true);
			node.removeEventListener('pointerup', onPinchUp, true);
			node.removeEventListener('pointercancel', onPinchUp, true);
		};
	});

	/**
	 * View keys live here because this is where `scale` is known. Photoshop's
	 * pair for the screen furniture, and the browser's own zoom keys taken over
	 * for the page rather than the app. Ctrl/Cmd+H is swallowed by macOS itself
	 * before a page ever sees it — that is the platform's, not ours to fix.
	 */
	/**
	 * The arrow keys lean the pad the way they are moving the area, while it is
	 * showing — the keyboard and the pad are one control, and a pad that sat
	 * still while the area went left looked like it had nothing to do with it.
	 * Only the lean: the page's own key handler does the nudging, as ever.
	 */
	const ARROW_LEAN: Record<string, 'up' | 'down' | 'left' | 'right'> = {
		ArrowUp: 'up',
		ArrowDown: 'down',
		ArrowLeft: 'left',
		ArrowRight: 'right'
	};
	const padShowing = () => padUsable && panning && !padHidden;

	function onKeyup(event: KeyboardEvent) {
		if (ARROW_LEAN[event.key] && pushed === ARROW_LEAN[event.key]) pushed = null;
	}

	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		if (ARROW_LEAN[event.key] && padShowing() && !event.ctrlKey && !event.metaKey && !modalOpen) {
			pushed = ARROW_LEAN[event.key];
		}
		// This listener is on the window, so it fires while a dialog is up too —
		// and zooming the page you cannot see behind Help is not what Ctrl+0 was
		// asked for.
		if (modalOpen) return;
		// Inkscape's key for its guides, bare, as it has it there: nothing else
		// on the stage is typed with a pipe.
		if (event.key === '|' && !event.ctrlKey && !event.metaKey && !event.altKey) {
			event.preventDefault();
			cycleGuides();
			return;
		}
		if (!event.ctrlKey && !event.metaKey) return;

		switch (event.key) {
			case '=':
			case '+':
				event.preventDefault();
				zoomBy(1.25);
				return;
			case '-':
			case '_':
				event.preventDefault();
				zoomBy(1 / 1.25);
				return;
			case '0':
				event.preventDefault();
				if (event.shiftKey) onzoom('actual');
				else onzoom('fit');
				return;
			// Two keys each: the punctuation is what they are named after on a
			// keyboard that has it, and the letters are what still works on one
			// that does not.
			// Photoshop's: Ctrl+H for its extras, which is what the boxes' bounds
			// are here, and Ctrl+; for its guides.
			case 'h':
			case 'H':
				event.preventDefault();
				cycleBounds();
				return;
			case ';':
			case ':':
				event.preventDefault();
				cycleGuides();
				return;
			case "'":
			case '"':
			case '#':
			case '~':
				event.preventDefault();
				ongrid(!grid);
		}
	}

	/**
	 * Press and hold to keep moving. A tap is one nudge; holding waits out the
	 * initial delay and then repeats, the same shape as a key repeat, because a
	 * pad that only moves once per tap is unusable for anything but a final
	 * millimetre.
	 *
	 * Each repeated step buzzes once, a tap's worth, so a hold counts out its
	 * 1, 5 or 10mm under the thumb the way a ratchet clicks. Not the first
	 * step: the press that started it already buzzed (haptics.ts), and two on
	 * one step felt like a stutter.
	 */
	let repeat: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Which key is being held down, so the pad can lean that way. The whole pad
	 * tilts rather than the one key sinking: five keys that each go down on their
	 * own read as five buttons, and this is one thing you push at a corner — the
	 * way a real pad rocks on the pivot under its middle.
	 */
	let pushed = $state<'up' | 'down' | 'left' | 'right' | 'centre' | null>(null);

	function startNudge(event: PointerEvent, dx: number, dy: number) {
		pushed = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
		onnudge(dx, dy);
		// Touch only, as every buzz in the app is (haptics.ts): a mouse held on
		// an arrow has the pad going down under a pointer it can see.
		const buzz = event.pointerType === 'touch' ? TAP_MS : 0;
		repeat = setTimeout(() => {
			repeat = setInterval(() => {
				onnudge(dx, dy);
				vibrate(buzz);
			}, 90);
		}, 400);
	}

	function stopNudge() {
		pushed = null;
		if (repeat === null) return;
		clearTimeout(repeat);
		clearInterval(repeat);
		repeat = null;
	}

	/**
	 * Where the pad sits, in pixels off the bottom right of the stage.
	 *
	 * It has to be movable because it is parked over the one corner of the page
	 * a right-aligned area lives in, and on a phone that is exactly the area you
	 * reached for the pad to nudge. Drag its middle button — the one the arrows
	 * are arranged round — and the pad comes with it; a tap still cycles the
	 * step. It was a press and hold, until a hold came to mean "what is this?".
	 */
	const PAD_HOME = { right: 12, bottom: 52 };
	/** How far the middle button travels before a press is a drag of the pad. */
	const PAD_SLOP = 6;
	let padAt = $state({ ...PAD_HOME });
	let padDrag = $state<{ x: number; y: number; from: { right: number; bottom: number } } | null>(null);
	let padHeld = $state(false);
	let padPress: { x: number; y: number; from: { right: number; bottom: number } } | null = null;

	/**
	 * Zoom and pan. On a phone a finger that lands on an area picks it up, and a
	 * card that has been laid out is mostly areas — so there was nowhere left to
	 * put a finger down to scroll the page, zoomed in, without moving something.
	 * With this on, an area no longer moves under a finger: one finger scrolls,
	 * two pinch, and a tap still chooses an area (and a second opens it), which
	 * the nudge pad — shown only while this is on — then moves. The resize
	 * handles and the lever still work: they are small, and grabbed on purpose.
	 * Its button is always above Area, and is the one way in and out.
	 *
	 * On by default where the main pointer is a finger: there, a page you can
	 * scroll without knocking things over, with the pad to move what you chose,
	 * is the editor that works, and dragging is the thing to ask for. Read once
	 * when the stage mounts rather than followed, so the choice made with the
	 * button is not undone by a keyboard being plugged in; and on the mount, not
	 * in the initialiser, because the page is prerendered where there is no
	 * pointer to ask about.
	 */
	let panning = $state(false);

	/**
	 * The pad put away. It covers a corner of the page, and zoomed in that can
	 * be the corner you are working on; held on its middle it goes, and a
	 * button under zoom and pan brings it back. The middle, because the arrows
	 * already repeat while held, and the middle's tap (the step) and drag (move
	 * the pad) are taken — a hold was the gesture it had left.
	 */
	let padHidden = $state(false);
	const PAD_HIDE_MS = 500;
	let padHideTimer: ReturnType<typeof setTimeout> | null = null;
	function cancelPadHide() {
		if (padHideTimer) clearTimeout(padHideTimer);
		padHideTimer = null;
	}

	$effect(() => {
		if (window.matchMedia('(pointer: coarse)').matches) panning = true;
	});

	/**
	 * Momentum: a pad flicked as it is let go carries on and slows to a stop,
	 * as a thing slid across a table does, rather than stopping dead under the
	 * fingertip. The speed is the last ~80ms of the drag, so a slow, careful
	 * placement has none and stays exactly where it was put. It runs through
	 * the same clamp as the drag, so it can glide to the edge and not past it.
	 */
	let padTrail: { x: number; y: number; t: number }[] = [];
	let padGlide: number | null = null;
	/** Fraction of the speed kept per millisecond — about 0.32s to slow by two thirds. */
	const PAD_FRICTION = 0.9965;
	/** Below this, in px per ms, a release is a placement rather than a flick. */
	const PAD_FLICK = 0.25;

	function stopGlide() {
		if (padGlide !== null) cancelAnimationFrame(padGlide);
		padGlide = null;
	}

	// A glide still running when the stage goes away has nothing left to move.
	$effect(() => stopGlide);

	function glidePad(vx: number, vy: number) {
		if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const stage = host.getBoundingClientRect();
		let last = performance.now();
		const frame = (now: number) => {
			const dt = Math.min(32, now - last);
			last = now;
			const keep = Math.pow(PAD_FRICTION, dt);
			vx *= keep;
			vy *= keep;
			// `right` and `bottom` grow towards the top left, the other way to
			// the pointer's x and y.
			padAt = {
				right: stashPad(padAt.right - vx * dt, stage.width),
				bottom: stashPad(padAt.bottom - vy * dt, stage.height)
			};
			if (Math.hypot(vx, vy) < 0.02) {
				padGlide = null;
				return;
			}
			padGlide = requestAnimationFrame(frame);
		};
		padGlide = requestAnimationFrame(frame);
	}

	function padPickup(event: PointerEvent) {
		if (event.button !== 0) return;
		stopGlide();
		padTrail = [{ x: event.clientX, y: event.clientY, t: event.timeStamp }];
		padPress = { x: event.clientX, y: event.clientY, from: { ...padAt } };
		// Captured now, so a quick drag that leaves the button still brings the pad.
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		cancelPadHide();
		padHideTimer = setTimeout(() => {
			padHideTimer = null;
			if (padDrag) return;
			// Held, so the click that ends the press does not also cycle the step.
			padHeld = true;
			padPress = null;
			padHidden = true;
			padThrown = false;
			pushed = null;
			vibrate(HOLD_MS);
		}, PAD_HIDE_MS);
	}

	/**
	 * The pad's geometry, in px. Must match `--cell` in the stylesheet: the
	 * stashing limit below is measured in cells, because what it is really about
	 * is the middle button.
	 */
	const PAD_CELL = 32;
	const PAD_SIZE = PAD_CELL * 3;

	/**
	 * The pad may hang off the edge of the stage — a cross parked over the
	 * corner of the page is still covering the corner, and tucking the far arm
	 * of it out of sight is the cheapest way to get that corner back. What it
	 * may not do is take the middle button with it: that button is how the pad
	 * is picked up again, and a pad you cannot reach is a control you have
	 * lost. So the far edge may reach the edge of the stage, and stop. The drag
	 * and the glide after a flick both go through this.
	 */
	const stashPad = (value: number, extent: number) => Math.max(-PAD_CELL, Math.min(extent - PAD_SIZE + PAD_CELL, value));

	function padMove(event: PointerEvent) {
		if (!padDrag && padPress) {
			if (Math.hypot(event.clientX - padPress.x, event.clientY - padPress.y) < PAD_SLOP) return;
			padDrag = padPress;
			padHeld = true;
			cancelPadHide();
		}
		if (!padDrag || !host) return;
		event.preventDefault();
		const stage = host.getBoundingClientRect();
		const wanted = {
			right: padDrag.from.right - (event.clientX - padDrag.x),
			bottom: padDrag.from.bottom - (event.clientY - padDrag.y)
		};
		padAt = { right: stashPad(wanted.right, stage.width), bottom: stashPad(wanted.bottom, stage.height) };
		padTrail.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
		while (padTrail.length > 2 && event.timeStamp - padTrail[0].t > 80) padTrail.shift();
		// How far the finger has gone on past where the pad stopped: pushed on
		// far enough, letting go puts it away.
		padPast = Math.max(Math.abs(wanted.right - padAt.right), Math.abs(wanted.bottom - padAt.bottom));
	}

	/** Past the edge by this much when let go, the pad is put away rather than parked. */
	const PAD_THROW = 24;
	let padPast = 0;
	/** Put away by throwing it at the edge: it comes back home, not hanging off it. */
	let padThrown = false;

	/**
	 * The pad shrinking into the button that brings it back, so it is plain
	 * where it went — put away by a hold or thrown at the edge, it used to just
	 * vanish. Worked out a moment after it starts, once the button it is going
	 * to has been drawn in the same update; nothing to go to, or a reader who
	 * asked for less motion, and it goes at once as before.
	 */
	function stowPad(node: HTMLElement) {
		return () => {
			const home = stage?.querySelector<HTMLElement>('[data-pad-home]')?.getBoundingClientRect();
			if (!home || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { duration: 0 };
			const r = node.getBoundingClientRect();
			const dx = home.left + home.width / 2 - (r.left + r.width / 2);
			const dy = home.top + home.height / 2 - (r.top + r.height / 2);
			const size = home.width / Math.max(1, r.width);
			return {
				duration: 280,
				easing: (t: number) => t * t * (3 - 2 * t),
				// `t` runs 1 to 0 on the way out: at 0 the pad is the button's
				// size, on the button.
				css: (t: number, u: number) =>
					`transform:translate(${dx * u}px, ${dy * u}px) scale(${1 - (1 - size) * u});transform-origin:center;opacity:${Math.min(1, t * 2)}`
			};
		};
	}

	/**
	 * The Locked band is the one indicator that is also the way out.
	 *
	 * Everything else on the page that says "you cannot do this" points at a
	 * button elsewhere — a lock is set where the rest of that subject's settings
	 * are. But a locked page has its whole settings bar disabled behind it, so
	 * the band is the nearest thing to hand, and it briefly wears the open
	 * padlock so a tap is answered rather than merely obeyed.
	 */
	let unlocking = $state(false);
	let unlockTimer: ReturnType<typeof setTimeout> | null = null;

	function unlock() {
		// Pressed again while it still shows the open padlock: that was a
		// mistake being taken back, so it locks again rather than doing nothing.
		if (unlocking) {
			if (unlockTimer) clearTimeout(unlockTimer);
			unlockTimer = null;
			unlocking = false;
			onrelock?.();
			return;
		}
		unlocking = true;
		if (unlockTimer) clearTimeout(unlockTimer);
		unlockTimer = setTimeout(() => (unlocking = false), 700);
		onunlock?.();
	}

	function padDrop(event?: PointerEvent) {
		cancelPadHide();
		if (padDrag && padPast > PAD_THROW) {
			padHidden = true;
			padThrown = true;
			pushed = null;
			vibrate(HOLD_MS);
		} else if (padDrag && padTrail.length > 1) {
			const first = padTrail[0];
			const last = padTrail[padTrail.length - 1];
			const dt = last.t - first.t;
			// A finger held still before it lifts sends no moves, so the trail
			// still holds the fast part of the drag: a pause before letting go
			// is a placement, whatever the speed before it.
			const paused = event ? event.timeStamp - last.t > 60 : false;
			if (dt > 0 && !paused) {
				const vx = (last.x - first.x) / dt;
				const vy = (last.y - first.y) / dt;
				if (Math.hypot(vx, vy) > PAD_FLICK) glidePad(vx, vy);
			}
		}
		padTrail = [];
		padPast = 0;
		padPress = null;
		padDrag = null;
		// Cleared on the next tick, so the click that follows the drag — which is
		// what would otherwise cycle the step — has already been swallowed.
		setTimeout(() => (padHeld = false), 0);
	}

	/**
	 * The Grid box's third state, dots, drawn as the indeterminate box — the
	 * dash — rather than a second tick that looks the same as ruled.
	 * `indeterminate` is a property with no attribute, so it is set here rather
	 * than in the markup; a click clears it natively, and the next update puts
	 * back whatever the grid is then.
	 */
	/**
	 * The Guides box's three states, one press apart: ticked draws the page
	 * margins and shows the temporary guides a drag lines up on; the dash keeps
	 * the temporary guides with no margins drawn; off is neither. Temporary
	 * guides are what most people mean by guides, so they are what the middle
	 * state keeps. The keys go round the same way.
	 */
	function cycleGuides() {
		if (guides) onguides(false, true);
		else if (smartGuides) onguides(false, false);
		else onguides(true, true);
	}

	/**
	 * The Boxes box's three states: ticked is the bounds and badges; the dash
	 * adds every tie drawn as its thread, as pointing at a tie badge draws one;
	 * off is none of it. The dash comes after the tick here, not before as on
	 * Guides, because it is more rather than less: the threads are about the
	 * boxes, and mean nothing without them.
	 */
	function cycleBounds() {
		if (!bounds) onbounds(true, false);
		else if (!ties) onbounds(true, true);
		else onbounds(false, false);
	}

	function mixed(node: HTMLInputElement, on: boolean) {
		node.indeterminate = on;
		return { update: (next: boolean) => (node.indeterminate = next) };
	}
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} onblur={() => (pushed = null)} />

<!--
	The stage is two elements: an outer one that does not scroll and holds every
	control, and an inner viewport that scrolls and holds only the page.

	They used to be one, which meant undo, the view toggles, the zoom and the
	pager were absolutely positioned inside the scroller and slid away with the
	page the moment it was too big to fit. A tool you have to scroll back to find
	is a tool that is not to hand.
-->
<!-- The grid, handed to the card to draw under its areas: the areas and the
     page margins sit on top of it, as they sit on the paper. Inside the card's
     transform, but in screen pixels all the same — the viewBox is the sheet's
     size on screen and the element the sheet's size before the zoom, so the
     transform scales one back to the other. The viewBox counts device pixels,
     so a stroke of 1 is one device pixel at any zoom. Editor furniture: only the stage passes it, so it never
     reaches a print or a contact sheet thumbnail. -->
{#snippet gridLayer()}
	{#if gridArt}
		<svg
			bind:this={gridSvg}
			class="grid-overlay"
			class:on-dark={isDark(template.page.background)}
			aria-hidden="true"
			viewBox="0 0 {gridArt.vw} {gridArt.vh}"
			style="width:{gridArt.w / scale}px;height:{gridArt.h / scale}px"
		>
			<path class="minor" class:dot={gridArt.dots} d={gridArt.minorPath} />
			<path class="major" class:dot={gridArt.dots} d={gridArt.majorPath} />
		</svg>
	{/if}
{/snippet}

<div class="stage" bind:this={stage}>
<div
	class="viewport"
	bind:this={host}
	data-own-pinch
	style="--pager-band:{pagerHeight ? pagerHeight + PAGE_GAP : 0}px"
	onpointerdown={(e) => {
		// Bare paper counts as empty space, not just the grey around the sheet:
		// clicking away from everything is how every canvas editor deselects, and
		// stopping at the page edge made it look broken. A box swallows its own
		// pointerdown, so this only ever fires on ground nobody owns.
		const el = e.target as HTMLElement;
		if (e.target === e.currentTarget || /\b(sheet|card|trim|scaler|page|grid-overlay)\b/.test(el.className)) onselect(null);
	}}
	role="region"
	aria-label="Card preview"
	tabindex="-1"
>
	<div
		class="page"
		bind:this={pageEl}
		class:settling={settle?.on}
		style="{zoomedIn || slack
			? `margin:${(zoomedIn ? clearance.top : 0) + slack}px ${(zoomedIn ? clearance.right : 0) + slack}px ${(zoomedIn ? clearance.bottom : 0) + slack}px ${(zoomedIn ? clearance.left : 0) + slack}px;`
			: ''}{settle ? `transform:translate(${settle.x}px, ${settle.y}px)` : ''}"
	>
	<!-- A picture file dropped on the page itself, rather than on an area,
	     becomes an area of its own there. An area's own drop stops the event
	     before it reaches this, so this only ever sees the ground between them. -->
	<div
		class="sheet"
		style="width:{mmToPx(outerW) * scale}px;height:{mmToPx(outerH) * scale}px"
		role="presentation"
		ondragover={(e) => {
			if (!onimagepagedrop || template.locked || !e.dataTransfer?.types.includes('Files')) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		}}
		ondrop={(e) => {
			if (!onimagepagedrop || template.locked) return;
			const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
			if (!file) return;
			e.preventDefault();
			onimagepagedrop(file, e.clientX, e.clientY);
		}}
	>
		<div class="scaler" style="transform:scale({scale})">
			<Card
				{template}
				{row}
				{rows}
				{mapping}
				{bounds}
				{ties}
				{loadingFonts}
				{grid}
				{guides}
				{smartGuides}
				{scale}
				{pageNumber}
				{theme}
				{background}
				{images}
				interactive={true}
				{panning}
				pageCount={rowCount}
				{editingId}
				{flashIds}
				{selectedIds}
				{onselect}
				{onchange}
				{onimagedrop}
				{onaction}
				{onmenu}
				{onmenuclose}
				{onedit}
				{ondraw}
				{oneditcell}
				{ontext}
				underlay={gridArt ? gridLayer : undefined}
			/>
		</div>


		{#if bounds && bleed > 0}
			<!-- Where the paper will be cut.

			     Drawn here rather than inside the card, over everything the card
			     draws — the grid included, which is inside the card now, under its
			     areas: a trim edge hidden under a gridline or an area is a trim edge
			     you cannot follow.

			     Solid, and the same half-pixel hairline the grid uses. It used to be
			     dashed and a whole pixel, which made it the loudest line on a page
			     that already has dashed bounds on every box. -->
			<!-- Sized in pixels rather than by `inset` alone. An `<svg>` is a replaced
			     element: with `width: auto` it takes its intrinsic 300 × 150 and
			     ignores the opposite offset, so the trim edge was drawn 300 × 150 at
			     every zoom and only looked right by accident near 100%. -->
			<svg
				class="trim-line"
				aria-hidden="true"
				style="left:{mmToPx(bleed) * scale}px;top:{mmToPx(bleed) *
					scale}px;width:{mmToPx(template.page.w) * scale}px;height:{mmToPx(template.page.h) * scale}px"
			><rect width="100%" height="100%" /></svg>
		{/if}
	</div>

	</div>
	</div>

	<!-- Which card you are looking at, and how to get to the next one. The same
	     shape as the lightbox's, because it is the same question — and the count
	     between the arrows is the way into it: the number naming the card you are
	     looking at is the obvious thing to press to see it properly. A lone card
	     keeps the door and loses the arrows, which would have nowhere to go.

	     Outside the viewport, so it stays under the sheet at every zoom; the
	     band it occupies is bottom padding on the viewport, which is what keeps
	     the page clear of it. -->
	{#if rowCount > 0}
		<div class="pager" role="group" aria-label="Card" bind:clientHeight={pagerHeight}>
			<!-- The swipe lives on this inner chip rather than on the row, because
			     the row spans the whole stage: hit-testing it would swallow every
			     press on the ground either side of the controls, and hit-testing
			     only the buttons left the gaps between them — and either arrow once
			     it greys out at an end — as dead patches where a flick did nothing.
			     The chip is exactly the three controls and the air between them,
			     which is the thing a thumb is aiming at. -->
			<div
				class="controls"
				use:swipe={(by) => onactivate(Math.max(0, Math.min(rowCount - 1, activeRow + by)))}
			>
				{#if rowCount > 1}
					<button
						class="step"
						disabled={activeRow <= 0}
						title={withKey('Previous card', 'cards')}
						aria-label="Previous card"
						onclick={() => onactivate(Math.max(0, activeRow - 1))}
					><Icon name="chevron-left" size={18} /></button>
				{/if}
				<button
					class="count"
					title="Look at this card full screen"
					onclick={onlightbox}
				>{activeRow + 1} / {rowCount}</button>
				{#if rowCount > 1}
					<button
						class="step"
						disabled={activeRow >= rowCount - 1}
						title={withKey('Next card', 'cards')}
						aria-label="Next card"
						onclick={() => onactivate(Math.min(rowCount - 1, activeRow + 1))}
					><Icon name="chevron-right" size={18} /></button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Editing the page happens at the page, not in a bar at the top of the
	     window: undoing is on one side, adding a box on the other, and the view
	     toggles are along the bottom. -->
	<div class="rail">
		<div class="corner">
			<button class="square" onclick={onundo} disabled={!undoable} title={withKey('Undo', 'undo')} aria-label="Undo">
				<Icon name="undo" size={16} />
			</button>
			<button class="square" onclick={onredo} disabled={!redoable} title={withKey('Redo', 'redo')} aria-label="Redo">
				<Icon name="redo" size={16} />
			</button>
		</div>

		<!-- Stacking order is about the page, not about type or color, so it sits
		     beside the page with undo and redo rather than in the options bar,
		     where it shoved every other control sideways. -->
		<!-- Not on a locked page, where nothing can be restacked: a column of
		     dead buttons says only what the padlock already does. -->
		{#if selectedIds.length && !template.locked}
			<div class="corner stack" role="toolbar" aria-label="Stacking order" aria-orientation="vertical">
				{#each ARRANGEMENTS as option (option.value)}
					<button
						class="square"
						title={option.label}
						aria-label={option.label}
						disabled={cannotArrange(option.value)}
						onclick={() => onarrange(option.value)}
					>
						<Icon name={option.icon} size={16} />
					</button>
				{/each}
			</div>
		{/if}

		{#if selectedBoxes.length > 1}
			<SelectionTools
				boxes={selectedBoxes}
				frozen={!!template.locked}
				{onalign}
				{ongroup}
				onlock={onlockselection}
				{onduplicate}
				{ondelete}
			/>
		{/if}
	</div>

	<!-- A column, not a row: Area is the button that is always there, and the
	     three that come and go belong under it rather than pushing it sideways
	     every time one of them appears.

	     16px, not 14: these are Carbon's 32-grid glyphs, and the finer ones
	     merge into a smudge below it. The column moves together, because one
	     button drawn larger than the others beside it reads as a mistake. The
	     automagic layout was here too, and moved to the page bar beside the
	     lock: it is pressed once at the start, if at all. -->
	<div class="corner top right stacked">
		<!-- The page's lock, while it is locked: a padlock and no word, at the
		     head of the column whose buttons it switches off, so the reason Area
		     is greyed out sits directly above it. A button, not only a sign —
		     pressing it unlocks, and for a moment afterwards it wears the open
		     padlock (`unlocking`), or it would vanish on the same frame and the
		     press would go unanswered. It was a "Locked" band over the sheet,
		     which took a band's height off the page at Fit. Not screen furniture,
		     whatever Boxes says: it is the one way to unlock from beside the page,
		     and with the outlines off it vanished and Area stood greyed out with
		     nothing above it to say why. -->
		{#if template.locked || unlocking}
			<button
				class="square page-lock"
				aria-pressed={!unlocking}
				title={unlocking ? 'Unlocked — press again to lock it' : withKey('The design is locked — press to unlock it', 'lockPage')}
				aria-label={unlocking ? 'Lock the design again' : 'Unlock the design'}
				onclick={unlock}
			>
				<Icon name={unlocking ? 'unlocked' : 'locked'} size={16} />
			</button>
		{/if}
		<!-- Nothing that changes the design on a locked page, not even greyed
		     out: the padlock above is the one thing to press, and a column of
		     dead buttons under it only said the same thing four more times. -->
		{#if !template.locked}
			<button
				class="square"
				onclick={onaddbox}
				title="Add an area to the page"
			>
				<Icon name="shapes" size={16} /><span class="sr-only">Area</span>
			</button>
			{#if drawTarget}
				<!-- Under Area, because it is the same kind of thing: Area makes one,
				     this draws in the one you have. -->
				<button
					class="square"
					onclick={() => ondraw?.(drawTarget)}
					title="Draw this area's image"
				>
					<Icon name="edit" size={16} /><span class="sr-only">Draw this area</span>
				</button>
			{/if}
			<!-- Zoom and pan, on and off, under the two that make areas: those
			     put things on the page, this is how you get about it. Always here
			     on an unlocked page, so the way in is not a gesture to be found.
			     It wears what a press on an area does now — Move, or zoom and
			     pan — and pressed it is the sign areas are not being dragged,
			     with the nudge pad beside it. -->
			<button
				class="square"
				aria-pressed={panning}
				onclick={() => (panning = !panning)}
				title={panning
					? 'Zoom and pan — a finger scrolls, areas stay put; tap one and nudge it with the pad. Press to drag areas again.'
					: 'Move — areas drag where you press them. Press for zoom and pan: scroll and pinch without dragging, and nudge with a pad.'}
			>
				<Icon name={panning ? 'zoom-pan' : 'move'} size={16} /><span class="sr-only">Zoom and pan</span>
			</button>
			{#if panning && padHidden}
				<!-- The pad, put away by holding its middle: this is where it is,
				     under the mode it belongs to. -->
				<button
					class="square"
					data-pad-home
					onclick={() => {
						padHidden = false;
						if (padThrown) padAt = { ...PAD_HOME };
						padThrown = false;
						// The hold that hid it ended with the pad gone, so its release
						// never arrived to clear this — and the first tap on the step
						// would be swallowed.
						padHeld = false;
					}}
					title="Show the nudge pad"
				>
					<Icon name="health-cross" size={16} /><span class="sr-only">Show the nudge pad</span>
				</button>
			{/if}
		{/if}
		{#if picking}
			<!-- A mode with no visible sign is a trap: every press is doing something
			     other than what it usually does, and the only place that was said is
			     a menu you have already dismissed. This is the sign, and pressing it
			     is the second way out — Escape is the first. -->
			<button
				class="square"
				aria-pressed="true"
				onclick={onstoppicking}
				title="Selecting several — every press adds an area or drops it. Press to stop, or Esc."
			>
				<Icon name="checkbox-checked" size={16} /><span class="sr-only">Stop selecting multiple</span>
			</button>
		{/if}
		{#if strayIds.length}
			<!-- Only when there is something to rescue. The editor does not clip, so
			     an area dragged off the sheet is still drawn — but only while the
			     stage happens to be showing that much ground, and zoomed in or on a
			     phone it is somewhere you cannot see and cannot reach. An area only
			     half off is the same problem by halves: the half out there is not
			     going to print, and nothing else on the page says so. -->
			<button
				class="square"
				onclick={onrescue}
				disabled={!!template.locked}
				title={template.locked
					? `${strayIds.length} area${strayIds.length === 1 ? ' is' : 's are'} not wholly on the page — unlock the design to bring ${strayIds.length === 1 ? 'it' : 'them'} back`
					: `${strayIds.length} area${strayIds.length === 1 ? ' is' : 's are'} not wholly on the page — bring ${strayIds.length === 1 ? 'it' : 'them'} back on, and nothing else`}
			>
				<Icon name="data-collection" size={16} /><span class="sr-only">Bring stray areas back onto the page</span>
			</button>
		{/if}
	</div>

	<!-- View state sits on the page it affects, one control per bottom corner,
	     rather than in the toolbar among the actions. On a phone the two words
	     side by side reach far enough into the band that the pager's first arrow,
	     centred in the same band, lands on top of "Boxes". They used to stack
	     into a column for that, which grew a two-line panel up over the sheet;
	     now the words go instead and the ticks keep their row — a # for the
	     grid, a | for the guides and a B for the boxes, beside checkboxes that
	     already say whether they are on. The full word stays the accessible name either way, so nothing
	     read aloud is reduced to a single letter. -->
	<div class="corner left">
		<!-- Three presses round: off, ruled, dots — a dot at every intersection,
		     the same grid and the same snapping, drawn quietly enough to lay type
		     over. One box rather than a second control, because the corner has
		     two words in it already, and the label says which it is drawing. It
		     was a press and hold, until a hold came to mean "what is this?". -->
		<label
			title="{GRID_MAJOR}mm grid with a {GRID_MINOR}mm subgrid; dragging snaps to it ({SHORTCUTS.grid}). Press again for {grid &&
			gridStyle === 'lines'
				? 'a dot grid'
				: grid
					? 'no grid'
					: 'ruled lines'}."
		>
			<input
				type="checkbox"
				aria-label={grid && gridStyle === 'dots' ? 'Dots' : 'Grid'}
				checked={grid}
				use:mixed={grid && gridStyle === 'dots'}
				onchange={(e) => {
					if (!grid) ongridstyle('lines');
					else if (gridStyle === 'lines') {
						// Ruled to dots: still on, so the box stays ticked.
						e.currentTarget.checked = true;
						ongridstyle('dots');
					} else ongrid(false);
				}}
			/>
			<span class="wide">{grid && gridStyle === 'dots' ? 'Dots' : 'Grid'}</span>
			<span class="narrow" aria-hidden="true">#</span>
		</label>
		<label
			title={withKey(
				guides
					? 'Page margins and alignment guides — press for alignment guides only'
					: smartGuides
						? 'Alignment guides only: a drag lines up on other areas\' edges and middles, and the page\'s centre — press to turn guides off'
						: 'No guides — press for the page margins and alignment guides',
				'guides'
			)}
		>
			<input
				type="checkbox"
				aria-label="Guides"
				checked={guides || smartGuides}
				use:mixed={!guides && smartGuides}
				onchange={(e) => {
					// The box's own toggle is overruled by the three states: what it
					// shows is set from them on the next update.
					e.currentTarget.checked = !(guides === false && smartGuides);
					cycleGuides();
				}}
			/>
			<span class="wide">Guides</span>
			<span class="narrow" aria-hidden="true">|</span>
		</label>
		<label
			title={withKey(
				!bounds
					? "No boxes — press for each area's dashed bounds, its badges and the trim edge (screen only, never printed)"
					: ties
						? 'Boxes, and every tie between areas drawn as its thread — press to turn boxes off'
						: "Each area's dashed bounds, its badges and the trim edge, screen only — press to draw every tie as well",
				'boxes'
			)}
		>
			<input
				type="checkbox"
				aria-label="Boxes"
				checked={bounds}
				use:mixed={bounds && ties}
				onchange={(e) => {
					// Overruled by the three states, as Guides is.
					e.currentTarget.checked = !(bounds && ties);
					cycleBounds();
				}}
			/>
			<span class="wide">Boxes</span>
			<span class="narrow" aria-hidden="true">B</span>
		</label>
	</div>

	<!-- Zoom, as the same kind of menu the template picker opens: Fit and the
	     paper's real size first, then under a rule the steps. A pinch or a
	     Ctrl+= lands between the steps, and gets an entry of its own so the
	     control always says where the page is. -->
	<div class="corner right">
		<MenuSelect
			label="Zoom"
			title={withKey('Zoom — double-click to go between Fit and the zoom before it', 'zoom')}
			bare
			value={typeof zoom === 'number' ? String(zoom) : zoom}
			items={zoomItems}
			onselect={(value) => onzoom(value === 'fit' || value === 'actual' ? value : Number(value))}
			ondouble={toggleFit}
		/>
	</div>

	{#if padUsable && panning && !padHidden}
		<!-- Touch has no arrow keys, and dragging a 2mm nudge with a fingertip is
		     hopeless. Shown only where there is no keyboard to fall back on, and
		     only while there is something it could actually move. Its arrows
		     repeat while held, so a hold here is never a request for a tip. -->
		<div
			class="pad"
			out:stowPad
			data-no-hold-tip
			class:moving={!!padDrag}
			class:push-up={pushed === 'up'}
			class:push-down={pushed === 'down'}
			class:push-left={pushed === 'left'}
			class:push-right={pushed === 'right'}
			class:push-centre={pushed === 'centre'}
			role="group"
			aria-label="Nudge the selected box"
			style="right:{padAt.right}px;bottom:{padAt.bottom}px"
			onpointerup={stopNudge}
			onpointercancel={stopNudge}
			onpointerleave={stopNudge}
			oncontextmenu={(e) => e.preventDefault()}
		>
			<!-- The tilt is its own element, under the pad that casts the shadow:
			     a 3D transform and a filter on one element is a pairing Firefox
			     draws badly, and on the two presses that tip the lit edges away it
			     drew the bevel as thick dark bars. -->
			<div class="tilt">
				<!-- On an anchored area the vertical keys change the Gap — see
				     `verticalTied`. -->
				<button
					class="up"
					class:tied={verticalTied}
					title={verticalTied ? `Gap ${padStep}mm smaller — closer to the area this one follows` : `Up ${padStep}mm`}
					onpointerdown={(e) => startNudge(e, 0, -padStep)}
				>
					<Icon name={verticalTied ? 'skip-back-filled' : 'caret-up'} size={verticalTied ? 16 : 30} />
				</button>
				<button class="left" title="Left {padStep}mm" onpointerdown={(e) => startNudge(e, -padStep, 0)}><Icon name="caret-left" size={30} /></button>
				<!-- The middle button carries the second gesture: drag it and the pad
				     comes with your finger. A tap still cycles the step. -->
				<button
					class="step"
					title="Step size — 1, 5 or 10mm. Drag it to move the pad; hold it to put the pad away."
					onpointerdown={(e) => {
						pushed = 'centre';
						padPickup(e);
					}}
					onpointermove={padMove}
					onpointerup={padDrop}
					onpointercancel={padDrop}
					onclick={() => {
						if (padHeld) return;
						padStep = PAD_STEPS[(PAD_STEPS.indexOf(padStep) + 1) % PAD_STEPS.length];
					}}>{padStep}</button
				>
				<button class="right" title="Right {padStep}mm" onpointerdown={(e) => startNudge(e, padStep, 0)}><Icon name="caret-right" size={30} /></button>
				<button
					class="down"
					class:tied={verticalTied}
					title={verticalTied ? `Gap ${padStep}mm larger — further from the area this one follows` : `Down ${padStep}mm`}
					onpointerdown={(e) => startNudge(e, 0, padStep)}
				>
					<Icon name={verticalTied ? 'skip-back-filled' : 'caret-down'} size={verticalTied ? 16 : 30} />
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	/* The frame: it holds every control and never scrolls, so nothing on it can
	   slide away with the page. */
	.stage {
		position: relative;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		background: #eee;
	}

	/* And the scroller inside it, which holds only the page. */
	.viewport {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		overflow: auto;
		/* A flick that runs past the end of the page must not become the
		   browser's pull-to-refresh — see app.css. */
		overscroll-behavior: contain;
		/* One finger scrolls; two are the page's own pinch (see `onPinchMove`)
		   and never the browser's, which zoomed the whole app — bars, table and
		   all — around a page that was zooming itself as well. Pinch is the one
		   gesture left out of the list, which is exactly what this says. */
		touch-action: pan-x pan-y;
		/* The stage is measured to work out the Fit scale, and the scale decides
		   how tall the sheet is, and the sheet's height decides whether a vertical
		   scrollbar appears — which takes ~15px off the width the measurement
		   started from. At a size where the scrollbar is marginal that is a loop,
		   and closing the page bar lands right in it. Reserving the gutter whether
		   or not it is used breaks the cycle at its one causal edge, rather than
		   damping the oscillation afterwards. */
		scrollbar-gutter: stable;
		/* The pager's band is real padding rather than a number subtracted from
		   the fitted scale, because the page is centred in what is left: taking it
		   off the scale alone would have centred the sheet across the band and
		   parked half of it under the count. */
		padding: 24px 24px calc(24px + var(--pager-band, 0px));
	}

	.viewport:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	/* The sheet and its pager travel together, so `place-items: center` centres
	   the pair rather than centring the sheet and leaving the pager to fend for
	   itself. */
	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		/* Kept in step with PAGE_GAP, which takes it out of the height the sheet
		   is allowed to fill. */
		gap: 10px;
	}

	/* The slide back after a gesture's room is taken away — see `slack`. */
	.page.settling {
		transition: transform 0.2s ease-out;
	}

	.sheet {
		position: relative;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
		background: #fff;
	}

	/* Fixed to the stage, under the sheet, whatever the page is doing. */
	.pager {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 10px;
		/* The bottom row's one height — see .corner — so the arrows and the
		   count centre on the same line as the two chips either side. */
		height: var(--chip-row);
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 10px;
		color: #555;
		/* The row spans the stage so the count stays centred on the page rather
		   than on whatever is left between the two bottom corners; only the
		   controls in it are hit-testable, so it does not swallow clicks on the
		   ground either side. */
		pointer-events: none;
	}

	/* Close about the count, so the chevrons stay clear of the chips in the
	   two corners: on a narrow phone the arrows sat under the # | B on one
	   side and the zoom on the other. */
	.pager .controls {
		display: flex;
		align-items: center;
		gap: 2px;
		pointer-events: auto;
		/* A flick across the pager is the gesture; without this the browser reads
		   the first few pixels of it as a pan, takes the pointer away with a
		   pointercancel, and the swipe never completes. Vertical is left alone so
		   a flick that was meant for the page still scrolls it. */
		touch-action: pan-y;
	}

	/* An arrow at the end of the run says so by greying out, but a disabled
	   button receives no pointer events at all — which made it a hole in the
	   chip a swipe could fall through. The chip behind it takes the gesture
	   instead, and the arrow still refuses the press. */
	.pager .step:disabled {
		pointer-events: none;
	}

	/* A control, not a readout, so it says so on hover — but no chip and no
	   border, because it still has to read as the count first. */
	.pager .count {
		font: 500 0.75rem ui-sans-serif, system-ui, sans-serif;
		min-width: 2.75rem;
		text-align: center;
		border: none;
		background: none;
		color: inherit;
		padding: 2px 4px;
		cursor: zoom-in;
	}

	.pager .count:hover {
		color: #111;
	}

	/* The chevron is the control, as in the lightbox: a chip around it would
	   make two marks out of one. */
	.pager .step {
		display: grid;
		place-items: center;
		padding: 2px;
		border: none;
		background: none;
		color: #555;
		cursor: pointer;
	}

	.pager .step:hover:not(:disabled) {
		color: #111;
	}

	.pager .step:disabled {
		opacity: 0.25;
		cursor: default;
	}

	/* As wide as the card and no wider. A block fills its parent, so the
	   scaler was the sheet's width *before* the transform — and scaled up, that
	   width scaled with it, so every zoom above 100% hung an empty band off the
	   sheet's right edge and gave the stage a scrollbar with nothing in view to
	   scroll to. Sized to its content, it scales to exactly the sheet. */
	.scaler {
		transform-origin: top left;
		width: max-content;
	}

	/* Grey, and as thin as a screen will draw: the grid is there to be measured
	   against, not looked at, and a colored one competed with the card. Both
	   rules are one device pixel, sat on one — the finest line a screen draws
	   sharp — and the 10mm rhythm is carried by the majors being darker rather
	   than thicker. The dots are the exception, far stronger; see gridArt. This overlay sits outside the card's transform
	   and is already sized in screen pixels, so its weight does not move with the
	   zoom, which is the same promise the card's own --line makes. */
	.grid-overlay {
		position: absolute;
		left: 0;
		top: 0;
		pointer-events: none;
	}

	.grid-overlay path {
		fill: none;
		/* One device pixel, placed on one (see gridArt): nothing to smooth, and
		   smoothing a snapped edge is only a way to blur it. */
		stroke-width: 1;
		shape-rendering: crispEdges;
	}

	/* Three fifths of the ink: solid black read as heavier than anything on
	   the card at a desktop's density, and four fifths still stood out. A dot
	   is little enough ink that much less than this and some screens lose it. */
	.grid-overlay path.dot {
		fill: rgba(var(--grid-ink), 0.6);
		stroke: none;
	}

	/* Black on a light paper, white on a dark one: grey at these strengths all
	   but vanished on a navy or black card, which is where a grid is needed as
	   much as anywhere. The strengths are the same either way; only the ink
	   turns over. A background image is not looked at — the paper color is the
	   only thing known without decoding it. */
	.grid-overlay {
		--grid-ink: 0, 0, 0;
	}

	.grid-overlay.on-dark {
		--grid-ink: 255, 255, 255;
	}

	.grid-overlay .minor {
		stroke: rgba(var(--grid-ink), 0.11);
	}

	.grid-overlay .major {
		stroke: rgba(var(--grid-ink), 0.3);
	}

	/* The same half-pixel hairline as the grid, and solid rather than dashed:
	   the card already carries a dashed bound on every box, and a second dashed
	   line a few millimetres away was two dashed lines rather than a trim edge.
	   An SVG stroke, not a border, for the same reason the card's own lines are:
	   a border of 0.5px is rounded up to a whole device pixel and a stroke is
	   not. Sitting outside the card's transform, it is already in screen pixels,
	   so its weight does not move with the zoom. */
	.trim-line {
		position: absolute;
		/* The stroke straddles the edge, so half of it is outside the rect. */
		overflow: visible;
		pointer-events: none;
	}

	.trim-line rect {
		fill: none;
		stroke: rgba(5, 150, 105, 0.85);
		stroke-width: 0.5;
	}

	/* Pressed, in the accent, like every Lock that is on: the state and the
	   way out of it in one square. */
	.page-lock[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-tint);
	}

	.stage {
		--chip-row: 30px;
	}

	.corner {
		position: absolute;
		bottom: 10px;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font: 500 0.6875rem/1 ui-sans-serif, system-ui, sans-serif;
		color: #555;
		background: rgba(255, 255, 255, 0.85);
		padding: 5px 7px;
		border-radius: 5px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.corner label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	/* The word says it is on in the colour the tick does. */
	.corner label:has(input:is(:checked, :indeterminate)) {
		color: var(--accent);
	}

	.corner.left {
		left: 12px;
	}

	.corner.right {
		right: 12px;
		padding: 2px 3px;
	}

	/* The two bottom chips, one height: the view toggles were 23px beside a
	   29px zoom, and the pager between them centred on neither. */
	.corner.left,
	.corner.right:not(.top) {
		box-sizing: border-box;
		height: var(--chip-row);
		padding-top: 0;
		padding-bottom: 0;
	}

	/* One column down the left edge: undo and redo always, the selection tools
	   under them when there is a selection to act on. */
	.rail {
		position: absolute;
		top: 12px;
		left: 12px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.rail .corner {
		position: static;
		flex-direction: column;
		padding: 4px;
		gap: 4px;
	}

	.rail .stack {
		align-items: stretch;
	}

	.corner.top {
		top: 12px;
		bottom: auto;
		padding: 4px;
		gap: 4px;
	}

	.corner.top.right {
		padding: 4px;
	}

	/* Area is always there; the rescue button and the Select Multiple chip come
	   and go, so they go under it rather than shifting it sideways. */
	.corner.stacked {
		flex-direction: column;
		align-items: stretch;
	}

	.corner button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: 0.75rem ui-sans-serif, system-ui, sans-serif;
		padding: 5px 9px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-button);
		background: #fff;
		color: #111;
		cursor: pointer;
	}

	.corner button:hover:not(:disabled) {
		border-color: var(--border-control-hover);
	}

	.corner button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.corner button.square {
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		justify-content: center;
	}


	.corner input {
		margin: 0;
	}

	/* No panel behind it: five controls over the page, not a widget parked on
	   top of it. The buttons keep the border every other tool here has. */
	/* One button size in this editor, and the pad now uses it: at 44px it was
	   the biggest thing on the page and read as a widget parked on top of the
	   card rather than as five controls beside it. The arrowheads keep the size
	   they were drawn at — a caret glyph fills half its own box, so a 32px icon
	   is a 16px mark and sits inside a 28px button with room to spare. */
	/* One cross, not five tiles.

	   It was five separate rounded rectangles with a gap between them, which read
	   as five buttons that happened to be arranged in a plus rather than as the
	   one control a d-pad is. The grid is the same 3 x 3; what changed is that
	   the cells touch, share a ground, and carry a border only on the edges that
	   are actually on the outside of the cross. The four corner cells stay empty,
	   so the card under them is still reachable.

	   `--cell` is the unit the whole thing is measured in, including the stashing
	   limit in the script — keep the two in step. */
	.pad {
		--cell: 32px;
		/* Carbon's carets sit 1/32 of the viewBox towards the point they face, so
		   a centred glyph is not a centred arrowhead. This is that unit at the
		   size they are drawn, taken back off along each one's own axis. */
		--arrow: 30px;
		--arrow-centre: calc(var(--arrow) / 32);
		position: absolute;
		/* Shown at any width: whether it is here at all is zoom and pan's call —
		   see `panning`. It used to be a phone's alone, under 900px. */
		display: block;
		/* A drop shadow rather than a box shadow on each key: this one follows
		   the painted shape, so the cross casts one shadow and the seams between
		   its arms cast none. It is there all the time now — a thing that stands
		   up off the page casts a shadow whether or not it is being moved. */
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.16));
		/* A held arrow is a repeat, not a long press: no callout, no selection,
		   and (with the context menu refused in the markup) none of the
		   browser's own long-press answer — on Android a buzz and a highlight
		   that came on top of the step's own. */
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}

	/* The cross itself, and what tilts: see the note in the markup. */
	.pad .tilt {
		display: grid;
		grid-template-columns: repeat(3, var(--cell));
		grid-template-rows: repeat(3, var(--cell));
		gap: 0;
		/* Short, because a pad that takes a tenth of a second to answer a tap
		   does not feel like a button. */
		transition: transform 80ms ease-out;
	}

	/* Pressed, the whole pad goes down at that edge — a perspective skew, so the
	   pressed edge is both lower and *further away*: it shortens, and the shape
	   goes trapezoid rather than parallelogram. That is the difference between a
	   thing pushed into the page and a thing sheared across it. The perspective
	   is short and the angle is wide, because a cross 96 pixels across has to
	   say this at a glance; with a long perspective and a small angle it read as
	   a rendering artefact. The axis is the one the press tips it about: from
	   the side, the vertical axis. */
	.pad.push-left .tilt {
		transform: perspective(220px) rotateY(-14deg) translateX(-1px);
	}

	.pad.push-right .tilt {
		transform: perspective(220px) rotateY(14deg) translateX(1px);
	}

	.pad.push-up .tilt {
		transform: perspective(220px) rotateX(14deg) translateY(-1px);
	}

	.pad.push-down .tilt {
		transform: perspective(220px) rotateX(-14deg) translateY(1px);
	}

	/* The middle is not a direction, so it goes straight down. */
	.pad.push-centre .tilt {
		transform: scale(0.97);
	}

	/* While it is being carried it follows the finger and nothing else: a pad
	   skewed and moving at once reads as a bug in the drag. */
	.pad.moving .tilt {
		transform: none;
	}

	/* Every cell carries a border on the three edges that are on the perimeter of
	   the cross and none at all on the edge facing its middle — the arms run into
	   the centre without a seam, so the cross is one shape rather than five. The
	   room that border took is given back as padding on the same edge, because a
	   cell inset on three sides and not the fourth centres its glyph half a pixel
	   off.

	   The widths are uneven and the colours are lit from the top left, which is
	   what makes the cross read as five keys standing up off the page rather
	   than as an outline of one: 1px along the top and left, 2px along the
	   bottom and right, and the shade is the same on every cell — so they are
	   inset unevenly but *identically*, and the cross is still square with
	   itself. The light is a gradient across the same diagonal. */
	.pad button {
		--pad-light: #fff;
		--pad-edge: #b9bcc2;
		--pad-shade: #8f949c;
		/* One flat colour across the whole inside of the cross. It was a gradient
		   per cell, which starts again at every cell: five separate sweeps of
		   light on a shape that is meant to be one surface. The bevel on the
		   perimeter is what lights it now, and it lights it once. */
		--pad-face: #f1f3f5;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		border-width: 1px 2px 2px 1px;
		border-style: solid;
		border-color: transparent;
		background: var(--pad-face);
		color: #333;
		font: 600 0.75rem ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		padding: 0;
		touch-action: none;
	}

	/* The twelve segments of the cross. Each edge is drawn once, by the cell that
	   owns it; the four re-entrant corners are where two of them meet at a point. */
	.pad .up {
		border-top-color: var(--pad-light);
		border-left-color: var(--pad-light);
		border-right-color: var(--pad-shade);
		border-bottom-width: 0;
		padding-bottom: 2px;
		border-radius: var(--radius-button) var(--radius-button) 0 0;
	}

	.pad .left {
		border-top-color: var(--pad-light);
		border-left-color: var(--pad-light);
		border-bottom-color: var(--pad-shade);
		border-right-width: 0;
		padding-right: 2px;
		border-radius: var(--radius-button) 0 0 var(--radius-button);
	}

	.pad .right {
		border-top-color: var(--pad-light);
		border-right-color: var(--pad-shade);
		border-bottom-color: var(--pad-shade);
		border-left-width: 0;
		padding-left: 1px;
		border-radius: 0 var(--radius-button) var(--radius-button) 0;
	}

	.pad .down {
		border-bottom-color: var(--pad-shade);
		border-left-color: var(--pad-light);
		border-right-color: var(--pad-shade);
		border-top-width: 0;
		padding-top: 1px;
		border-radius: 0 0 var(--radius-button) var(--radius-button);
	}

	/* Each arrowhead pulled back onto the centre of its own cell, along the axis
	   it points down — see `--arrow-centre`. Only while it is an arrowhead: a
	   tied direction wears the gap mark instead, which is centred as drawn. */
	.pad .up:not(.tied) :global(svg) {
		transform: translateY(var(--arrow-centre));
	}

	.pad .down:not(.tied) :global(svg) {
		transform: translateY(calc(-1 * var(--arrow-centre)));
	}

	.pad .left :global(svg) {
		transform: translateX(var(--arrow-centre));
	}

	.pad .right :global(svg) {
		transform: translateX(calc(-1 * var(--arrow-centre)));
	}

	/* The gap marks, turned to point along the key: the bar is the edge of the
	   area this one follows, so up is "towards it" — the icon points left as
	   drawn, a quarter turn clockwise points it up. Down is the reverse. */
	.pad .up.tied :global(svg) {
		transform: rotate(90deg);
	}

	.pad .down.tied :global(svg) {
		transform: rotate(-90deg);
	}

	/* While it is being carried: the pad itself says so, because the finger is on
	   the one button whose look would otherwise not change. Only the coloured
	   edges change colour — the transparent ones stay transparent, or the cross
	   would light up as five boxes again. */
	/* Being carried: the same shadow, thrown further, so the pad reads as picked
	   up rather than as merely recoloured. */
	.pad.moving {
		filter: drop-shadow(0 7px 14px rgba(0, 0, 0, 0.3));
	}

	.pad.moving .up,
	.pad.moving .left,
	.pad.moving .right,
	.pad.moving .down {
		border-color: transparent;
	}

	.pad.moving .up {
		border-top-color: var(--accent);
		border-left-color: var(--accent);
		border-right-color: var(--accent);
	}

	.pad.moving .left {
		border-top-color: var(--accent);
		border-left-color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.pad.moving .right {
		border-top-color: var(--accent);
		border-right-color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.pad.moving .down {
		border-bottom-color: var(--accent);
		border-left-color: var(--accent);
		border-right-color: var(--accent);
	}

	.pad .up { grid-area: 1 / 2; }
	.pad .left { grid-area: 2 / 1; }
	/* The middle is the step and the grip the pad is carried by, and it is drawn
	   as nothing at all: the same face as the arms, with the number on it. A well,
	   a ring, a shadow and a flat disc were each tried under that number and each
	   one drew a hole in a surface that is meant to be continuous. The digit is
	   enough to say the middle is a key, and the cross stays one shape. */
	.pad .step {
		grid-area: 2 / 2;
		background: var(--pad-face);
	}
	.pad .right { grid-area: 2 / 3; }
	.pad .down { grid-area: 3 / 2; }

	@media (max-width: 900px) {
		.stage {
			padding: 8px;
		}
	}

	/* The short forms are the phone's; the words are everywhere else's. Both are
	   in the DOM at every width so the swap costs nothing at the moment it
	   happens. */
	.corner .narrow {
		display: none;
	}

	/* Same 520px the export screen calls narrow, so the app has one idea of it. */
	@media (max-width: 520px) {
		.corner.left {
			gap: 8px;
		}

		.corner.left .wide {
			display: none;
		}

		.corner.left .narrow {
			/* inline-block, because a width means nothing on an inline box: the
			   two marks are different widths and the ticks would not line up. */
			display: inline-block;
			/* A lone # or B is a mark, not a word: it needs the weight to read as
			   a label rather than as a stray glyph beside a tick. */
			font-weight: 700;
			width: 0.75em;
			text-align: center;
		}
	}

	/* Tighter again where the corners are closest: the count's floor comes
	   off, so the three are as narrow as "1 / 4" and two chevrons. */
	@media (max-width: 400px) {
		.pager .count {
			min-width: 0;
			padding: 2px;
		}

		.pager .step {
			padding: 0;
		}
	}
</style>
