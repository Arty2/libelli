<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import {
		boardFor,
		boardSize,
		fitBoard,
		isDefaultBoard,
		line,
		pixelAt,
		ellipseOutline,
		rectOutline,
		squareFrom,
		MAX_SIDE,
		MIN_SIDE,
		type Grid
	} from '$lib/bitmap';
	import { frameBetween, framePixels, isCrop, type Frame } from '$lib/photo';
	import type { Box } from '$lib/types';

	/**
	 * A small drawing surface, in the side panel.
	 *
	 * Large on purpose, and never in place: an area on the card is often a
	 * centimetre across, which is somewhere to *show* a drawing and nowhere to
	 * make one. The board starts at 64 by 64 and can be made any size — see
	 * `bitmap.ts` — and what comes out is a PNG data URL, which
	 * goes into the row's cell, so the picture travels with the table rather than
	 * living beside it; an area with no column keeps it on the area.
	 *
	 * Nothing is written until the panel's Save, and each save is one entry in
	 * the app's own undo, however many strokes it took — the undo in here is
	 * the editor's own and goes no further.
	 */

	interface Props {
		/** Only its board is read — a cell opened from the table may have no area. */
		box: Pick<Box, 'pixels'>;
		/** what the area holds now: a data URL to draw on top of, or nothing */
		value: string;
		/**
		 * The ink the pen starts with: the area's own colour where it has one,
		 * and the page default where it inherits — so a drawing made in an area
		 * is that area's colour unless another is picked.
		 */
		ink: string;
		/** The picture, and the board it was made on unless that is the usual one. */
		onsave: (dataUrl: string, pixels: Grid | undefined) => void;
		/**
		 * Whether there is drawing not yet saved — the side panel's Save lights
		 * up on it, and its pager waits for it.
		 */
		ondirty?: (dirty: boolean) => void;
		/**
		 * Where the panel wants the board's own row — its size, the paper, its
		 * weight — and its undo and redo: in the panel's title bar and at the
		 * head of its bottom bar, beside Delete and Save, rather than in rows of
		 * their own that took height from the board. Moved there as they are
		 * drawn (see `portal`); without a slot they stay here.
		 */
		head?: HTMLElement | null;
		bar?: HTMLElement | null;
		/** What the clipboard answered, to the app's status bar. */
		onnotice?: (message: string, tone?: 'info' | 'warning') => void;
	}

	let { box, value, ink, onsave, ondirty, head = null, bar = null, onnotice }: Props = $props();

	/** Put a node inside another element, and take it out again with this editor. */
	function portal(node: HTMLElement, target: HTMLElement | null) {
		const move = (to: HTMLElement | null) => {
			if (to && node.parentElement !== to) to.appendChild(node);
		};
		move(target);
		return { update: move, destroy: () => node.remove() };
	}

	/**
	 * Changes made, and how many of them the last save had seen. A count rather
	 * than the length of `history`, which is capped: past the cap a new stroke
	 * leaves the length where it was, and would have looked like no change.
	 */
	let edits = $state(0);
	let savedEdits = $state(0);
	const dirty = $derived(edits !== savedEdits);

	$effect(() => {
		ondirty?.(dirty);
	});

	/**
	 * Write the board. Called by the side panel's Save rather than by a button
	 * in here: Save and Delete sit in the panel's own bar, where every picture's
	 * do, so the board's rows are only what you draw with.
	 */
	export function save() {
		const data = exported();
		if (!data) return;
		// The usual board is the absence of the field, the same rule the rest of
		// the format follows.
		onsave(data, isDefaultBoard(grid) ? undefined : { ...grid });
		savedEdits = edits;
	}

	// Read once: the box cannot change while this is up, and the board is the
	// editor's own state from here on — Done is what writes it back. What the
	// area holds already can move it again, once that has loaded.
	let grid = $state<Grid>(untrack(() => boardSize(box)));

	let canvas = $state<HTMLCanvasElement | null>(null);
	type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse';
	let tool = $state<Tool>('pen');
	/**
	 * The rectangle drawn as a square, the ellipse as a circle — a second press
	 * on the tool already up turns it on and off, and Shift does it for one
	 * drag. Remembered separately, since wanting squares says nothing about
	 * wanting circles.
	 */
	let square = $state(false);
	let circle = $state(false);
	let lastPress: { tool: Tool; at: number } | null = null;

	/**
	 * Pick a tool; press the rectangle or the ellipse twice, quickly, to switch
	 * it between free and square or circle. Timed here rather than left to
	 * `dblclick`, which a phone may not send for two taps on a button.
	 */
	function pick(next: Tool) {
		const now = performance.now();
		const again = lastPress?.tool === next && now - lastPress.at < 400 && tool === next;
		lastPress = { tool: next, at: now };
		tool = next;
		if (!again) return;
		lastPress = null;
		if (next === 'rect') square = !square;
		if (next === 'ellipse') circle = !circle;
	}

	/**
	 * Any CSS colour as the #rrggbb a colour input can hold, by way of the
	 * canvas, which already knows every way a colour can be written. A colour
	 * it cannot read comes out black, as a canvas would draw it.
	 */
	function hexOf(css: string): string {
		const ctx = document.createElement('canvas').getContext('2d');
		if (!ctx) return '#000000';
		ctx.fillStyle = '#000000';
		ctx.fillStyle = css;
		const out = String(ctx.fillStyle);
		if (out.startsWith('#')) return out;
		const [r, g, b] = out.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
		return '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
	}

	/** What the pen draws in: the area's own to start with, anything once picked. */
	let color = $state(untrack(() => hexOf(ink)));

	/** The nib's three widths, one button: each press is the next. */
	const NIBS = [1, 2, 4];
	const nextNib = () => (nib = NIBS[(NIBS.indexOf(nib) + 1) % NIBS.length]);
	/**
	 * Which paper the transparent pixels show. An area's ink is its own colour,
	 * and a drawing in white or a pale yellow is invisible on light checks — the
	 * checkerboard is there to say "nothing here", and it cannot do that by
	 * hiding what is.
	 */
	let checks = $state<'light' | 'dark'>('light');
	/** brush width in pixels of the grid, not of the screen */
	let nib = $state(1);
	let weight = $state<number | null>(null);

	/**
	 * Whole canvases rather than a list of strokes: at this size it is nothing.
	 * `history` is what has been done and `future` what has been undone — a new
	 * stroke empties the second, because a drawing cannot be redone onto a
	 * different one. The board is part of the entry, so resizing is a step like
	 * any other and undo puts the drawing back on the board it was made on.
	 */
	interface Shot {
		image: ImageData;
		grid: Grid;
	}

	let history = $state<Shot[]>([]);
	let future = $state<Shot[]>([]);
	let drawing = $state(false);
	let last: { x: number; y: number } | null = null;
	/**
	 * Where a straight line started, and the board as it was before the line was
	 * previewed onto it. A line is drawn over and over while the pointer moves,
	 * so each preview starts from the same clean board rather than from the last
	 * one — otherwise a line dragged around leaves a fan of every line it passed
	 * through.
	 */
	let lineFrom: { x: number; y: number } | null = null;
	let beneath: ImageData | null = null;

	const context = () => canvas?.getContext('2d', { willReadFrequently: true }) ?? null;

	/**
	 * Whatever the area holds already, drawn in. An existing picture — one drawn
	 * before, or dropped in as a file — is scaled onto the board rather than
	 * refused, so opening this on an area is never destructive until a stroke is
	 * made.
	 */
	function start(node: HTMLCanvasElement) {
		canvas = node;
		const ctx = node.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		// Said from the start, so the cost of a drawing is not a surprise that
		// only appears once the first stroke is down.
		measure();
		if (!value) return;
		const image = new Image();
		image.onload = async () => {
			// The picture's own size wins over the board the area remembers: what
			// is in the cell is the thing being edited, and opening it on another
			// board would resample a picture nobody asked to resize. Only one with
			// a side past the largest board is scaled.
			const own = boardFor(image.naturalWidth, image.naturalHeight);
			if (own.w !== grid.w || own.h !== grid.h) {
				grid = own;
				await tick();
			}
			const onto = context();
			if (!onto) return;
			onto.imageSmoothingEnabled = false;
			if (image.naturalWidth <= grid.w && image.naturalHeight <= grid.h) {
				onto.drawImage(image, 0, 0);
			} else {
				onto.drawImage(image, 0, 0, grid.w, grid.h);
			}
			measure();
		};
		image.src = value;
	}

	const snapshot = () => context()?.getImageData(0, 0, grid.w, grid.h) ?? null;

	function shot(): Shot | null {
		const image = snapshot();
		return image ? { image, grid: { ...grid } } : null;
	}

	/**
	 * A remembered canvas back onto the current board. Scaled when the board has
	 * been resized since, which is what lets undo still reach across a resize:
	 * the drawing comes back at the size it is being drawn at now. Not the
	 * clipboard's paste — that is `paste`, below.
	 */
	function restore(data: ImageData) {
		const ctx = context();
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, grid.w, grid.h);
		if (data.width === grid.w && data.height === grid.h) {
			ctx.putImageData(data, 0, 0);
			return;
		}
		const from = document.createElement('canvas');
		from.width = data.width;
		from.height = data.height;
		from.getContext('2d')?.putImageData(data, 0, 0);
		ctx.drawImage(from, 0, 0, grid.w, grid.h);
	}

	function remember(): Shot | null {
		const taken = shot();
		if (!taken) return null;
		edits += 1;
		history = [...history.slice(-29), taken];
		future = [];
		return taken;
	}

	/** A remembered step, board and all. */
	async function apply(step: Shot) {
		const resized = step.grid.w !== grid.w || step.grid.h !== grid.h;
		grid = { ...step.grid };
		if (resized) {
			// The canvas is cleared by its own resize, so the pixels go back after.
			await tick();
		}
		restore(step.image);
		measure();
	}

	async function undo() {
		frame = null;
		const previous = history.at(-1);
		const current = shot();
		if (!previous || !current) return;
		history = history.slice(0, -1);
		future = [...future, current];
		edits += 1;
		await apply(previous);
	}

	async function redo() {
		frame = null;
		const next = future.at(-1);
		const current = shot();
		if (!next || !current) return;
		future = future.slice(0, -1);
		history = [...history, current];
		edits += 1;
		await apply(next);
	}

	/**
	 * A different board, with what has been drawn scaled onto it. Resizing is a
	 * step like any other, so a board set too small is one undo away — though
	 * what the scaling dropped on the way down is gone, which is the honest cost
	 * of drawing at eight pixels and asking for sixteen back.
	 */
	async function setSize(next: Grid) {
		frame = null;
		if (next.w === grid.w && next.h === grid.h) return;
		const before = remember();
		grid = next;
		await tick();
		if (before) restore(before.image);
		measure();
	}

	/** A side, typed; the other one stays as it is. */
	const setSide = (axis: 'w' | 'h', raw: unknown) =>
		setSize(axis === 'w' ? fitBoard(raw, grid.h) : fitBoard(grid.w, raw));

	/**
	 * A quarter turn clockwise. The board turns with the drawing — a landscape
	 * board rotated onto a portrait one would have to crop or letterbox, and
	 * neither is what "rotate" means.
	 */
	async function rotate() {
		frame = null;
		const before = remember();
		if (!before) return;
		grid = { w: grid.h, h: grid.w };
		await tick();
		const ctx = context();
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, grid.w, grid.h);
		const from = document.createElement('canvas');
		from.width = before.image.width;
		from.height = before.image.height;
		from.getContext('2d')?.putImageData(before.image, 0, 0);
		ctx.save();
		// The turn is about the origin, so the canvas is walked to the top right
		// corner first — which is where the old top left lands.
		ctx.translate(grid.w, 0);
		ctx.rotate(Math.PI / 2);
		ctx.drawImage(from, 0, 0);
		ctx.restore();
		measure();
	}

	/**
	 * The drawing mirrored across the board — left to right, or top to bottom.
	 * The board keeps its shape, so nothing is resampled: every pixel lands on
	 * a pixel.
	 */
	function flip(axis: 'x' | 'y') {
		frame = null;
		const before = remember();
		const ctx = context();
		if (!before || !ctx) return;
		const from = document.createElement('canvas');
		from.width = before.image.width;
		from.height = before.image.height;
		from.getContext('2d')?.putImageData(before.image, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, grid.w, grid.h);
		ctx.save();
		ctx.translate(axis === 'x' ? grid.w : 0, axis === 'y' ? grid.h : 0);
		ctx.scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1);
		ctx.drawImage(from, 0, 0);
		ctx.restore();
		measure();
	}

	/**
	 * A crop, as the Images tray does one: press Crop, drag a frame over the
	 * board, Apply. It used to trim the board to what was drawn on it, which
	 * is what a repeating area already does as it is drawn (see `tile.ts`) and
	 * left no way to keep a margin or cut into the drawing. The frame snaps to
	 * whole pixels as it is dragged, so what is shown is what is kept.
	 */
	let cropping = $state(false);
	let frame = $state<Frame | null>(null);
	let framing: { id: number; from: { x: number; y: number } } | null = null;
	/** The frame in the board's own pixels, and as fractions of it again for drawing. */
	const cropPixels = $derived(isCrop(frame) ? framePixels(frame, grid.w, grid.h) : null);

	function toggleCrop() {
		cropping = !cropping;
		frame = null;
	}

	const fractionAt = (event: PointerEvent) => {
		const rect = canvas!.getBoundingClientRect();
		return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
	};

	async function applyCrop() {
		const px = cropPixels;
		const before = px && remember();
		if (!px || !before) return;
		grid = { w: px.w, h: px.h };
		await tick();
		const ctx = context();
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, grid.w, grid.h);
		const from = document.createElement('canvas');
		from.width = before.image.width;
		from.height = before.image.height;
		from.getContext('2d')?.putImageData(before.image, 0, 0);
		// One to one, offset so the frame's corner lands at the origin: cropping
		// must not resample what it keeps.
		ctx.drawImage(from, -px.x, -px.y);
		frame = null;
		cropping = false;
		measure();
	}

	/**
	 * The board onto the clipboard as a PNG, and back off it.
	 *
	 * A picture pasted in replaces what is on the board and brings its own size
	 * with it, the same rule as opening the editor on a picture that is already
	 * in the cell — and like everything else here it is one undo away.
	 */
	async function copy() {
		const data = canvas && (await new Promise<Blob | null>((done) => canvas!.toBlob(done, 'image/png')));
		if (!data) return;
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': data })]);
			say('Copied');
		} catch {
			// Firefox writes images only from a user gesture it recognises, and a
			// page without the permission gets nothing. Said out loud rather than
			// failing quietly, because a copy that did not happen looks exactly
			// like one that did until you paste.
			say('This browser would not let go of the clipboard', 'warning');
		}
	}

	async function paste() {
		let source: string | null = null;
		try {
			for (const item of await navigator.clipboard.read()) {
				const type = item.types.find((t) => t.startsWith('image/'));
				if (!type) continue;
				source = URL.createObjectURL(await item.getType(type));
				break;
			}
		} catch {
			say('This browser would not let go of the clipboard', 'warning');
			return;
		}
		if (!source) {
			say('No image on the clipboard', 'warning');
			return;
		}
		try {
			const image = new Image();
			await new Promise((done, fail) => {
				image.onload = done;
				image.onerror = fail;
				image.src = source as string;
			});
			remember();
			const own = boardFor(image.naturalWidth, image.naturalHeight);
			if (own.w !== grid.w || own.h !== grid.h) {
				grid = own;
				await tick();
			}
			const ctx = context();
			if (!ctx) return;
			ctx.imageSmoothingEnabled = false;
			ctx.clearRect(0, 0, grid.w, grid.h);
			if (image.naturalWidth <= grid.w && image.naturalHeight <= grid.h) {
				ctx.drawImage(image, 0, 0);
			} else {
				ctx.drawImage(image, 0, 0, grid.w, grid.h);
			}
			measure();
			say('Pasted');
		} finally {
			URL.revokeObjectURL(source);
		}
	}

	/**
	 * The clipboard's answers, and crop's, in the app's status bar, where every
	 * other notice is: a refusal is otherwise invisible, and a copy that did not
	 * happen looks exactly like one that did until you paste.
	 */
	function say(words: string, tone: 'info' | 'warning' = 'info') {
		onnotice?.(words, tone);
	}

	/**
	 * What goes into the cell: the whole board, always. An area set to repeat
	 * shows only the drawn pixels, but that trimming happens as the card is
	 * drawn — see `Card.svelte` — so the cell keeps what was drawn and changing
	 * an area to repeat and back changes nothing about the table.
	 */
	const exported = () => canvas?.toDataURL('image/png') ?? null;

	/** What this drawing will cost the cell it is going into, as it is drawn. */
	function measure() {
		const data = exported();
		weight = data ? Math.round(data.length / 102.4) / 10 : null;
	}

	function paint(at: { x: number; y: number }) {
		const ctx = context();
		if (!ctx) return;
		// The nib is drawn from the pixel the pointer is on, not centred on it:
		// centring a two-pixel nib has to round, and a stroke that lands a pixel
		// off where the pointer was is the one thing a pixel editor cannot do.
		if (tool === 'eraser') ctx.clearRect(at.x, at.y, nib, nib);
		else {
			ctx.fillStyle = color;
			ctx.fillRect(at.x, at.y, nib, nib);
		}
	}

	function down(event: PointerEvent) {
		if (event.button !== 0 || !canvas) return;
		event.preventDefault();
		if (cropping) {
			canvas.setPointerCapture(event.pointerId);
			const from = fractionAt(event);
			framing = { id: event.pointerId, from };
			frame = frameBetween(from, from);
			return;
		}
		// The press is held back from the page, so it would not move the focus:
		// after Save in the panel's bar, the next Ctrl/Cmd+Z or S would go to
		// the app instead of the board being drawn on.
		canvas.closest<HTMLElement>('.drawer')?.focus({ preventScroll: true });
		canvas.setPointerCapture(event.pointerId);
		remember();
		drawing = true;
		const at = positionOf(event);
		last = at;
		if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
			lineFrom = at;
			beneath = snapshot();
		}
		// A line of no length is a dot, which is what a tap should leave behind
		// whichever tool is up.
		paint(at);
	}

	function move(event: PointerEvent) {
		if (framing?.id === event.pointerId) {
			frame = frameBetween(framing.from, fractionAt(event));
			return;
		}
		if (!drawing) return;
		const at = positionOf(event);
		if (lineFrom && (tool === 'line' || tool === 'rect' || tool === 'ellipse')) {
			// The board as it was, then this shape on top of it: the drag is a
			// preview of one shape, not a trail of them.
			if (beneath) restore(beneath);
			for (const point of shape(lineFrom, at, event.shiftKey)) paint(point);
			last = at;
			return;
		}
		// Every pixel between the last report and this one: a quick stroke reports
		// a handful of points and would otherwise draw as dots.
		for (const point of line(last ?? at, at)) paint(point);
		last = at;
	}

	/** The pixels of the shape the tool draws between where the drag began and now. */
	function shape(from: { x: number; y: number }, to: { x: number; y: number }, shift: boolean) {
		if (tool === 'line') return line(from, to);
		const even = shift !== (tool === 'rect' ? square : circle);
		const corner = even ? squareFrom(from, to) : to;
		return tool === 'rect' ? rectOutline(from, corner) : ellipseOutline(from, corner);
	}

	function up(event: PointerEvent) {
		if (framing?.id === event.pointerId) {
			framing = null;
			if (!isCrop(frame)) frame = null;
			return;
		}
		if (!drawing) return;
		drawing = false;
		last = null;
		lineFrom = null;
		beneath = null;
		canvas?.releasePointerCapture(event.pointerId);
		measure();
	}

	function positionOf(event: PointerEvent) {
		const rect = canvas!.getBoundingClientRect();
		return pixelAt(event.clientX - rect.left, event.clientY - rect.top, rect, grid);
	}

	function onKeydown(event: KeyboardEvent) {
		// The app's own shortcuts listen on the window behind this, and a Delete
		// or an arrow meant for the board would delete or nudge an area of the
		// card. Every key but Escape stops here; Escape goes on to the side
		// panel, which it closes.
		if (event.key !== 'Escape') event.stopPropagation();
		if (!(event.metaKey || event.ctrlKey)) return;
		const key = event.key.toLowerCase();
		if (key === 's') {
			event.preventDefault();
			save();
			return;
		}
		if (key !== 'z' && key !== 'c' && key !== 'v') return;
		event.preventDefault();
		// The same chord the app itself uses, shifted for the way back.
		if (key === 'z') {
			if (event.shiftKey) redo();
			else undo();
		}
		// The board is the document while this is open, so the usual two chords
		// mean the board rather than the page behind it.
		if (key === 'c') void copy();
		if (key === 'v') void paste();
	}

	/** The board takes the focus so its keys are its own from the start. */
	const takeFocus = (node: HTMLElement) => node.focus({ preventScroll: true });

	/**
	 * How large the board is drawn: as large as the room gives it, always, so
	 * there is never a scrollbar round the board and never a margin of unused
	 * room. It used to step in whole screen pixels per board pixel, which kept
	 * every pixel exactly the same width but left up to a board-pixel's worth
	 * of room empty on each side — on a phone, a third of the tray. Now it
	 * fills: `image-rendering: pixelated` keeps the edges hard, and at the
	 * cost of a column of pixels here and there being a screen pixel wider
	 * than its neighbours, which reads as nothing at these sizes.
	 */
	let room = $state({ w: 0, h: 0 });
	// Less a pixel each side, for the board's hairline border.
	const zoom = $derived(Math.max(0, Math.min((room.w - 2) / grid.w, (room.h - 2) / grid.h)) || 1);
</script>

<!-- In the side panel, where a cell is edited full size: the card it is
     drawing for stays in view beside it, and the panel's head is its title.
     It was a dialog over the app until the table's own editor could hold it. -->
<!-- An application in the ARIA sense: a surface that takes its own keys,
     which the compiler's list of interactive roles does not count. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="drawer" role="application" aria-label="Drawing" tabindex="-1" onkeydown={onKeydown} use:takeFocus>
	<!-- One row over the board: the paper to see it on, its size, and what it
	     weighs — which grows with the size, and is why it is in view. -->
	<div class="board" use:portal={head}>
		<button
			class="square"
			aria-pressed={checks === 'dark'}
			title="Show the transparent squares dark or light — a pale drawing needs the dark ones"
			aria-label="Dark checkerboard"
			onclick={() => (checks = checks === 'dark' ? 'light' : 'dark')}
		>
			<Icon name="contrast" size={16} />
		</button>
		<input
			type="number"
			min={MIN_SIDE}
			max={MAX_SIDE}
			value={grid.w}
			title="Board width, in pixels"
			aria-label="Board width in pixels"
			onchange={(e) => setSide('w', e.currentTarget.value)}
		/>
		<span class="by" aria-hidden="true">×</span>
		<input
			type="number"
			min={MIN_SIDE}
			max={MAX_SIDE}
			value={grid.h}
			title="Board height, in pixels"
			aria-label="Board height in pixels"
			onchange={(e) => setSide('h', e.currentTarget.value)}
		/>
		<span class="by">px</span>
		<!-- Said out loud, because this is going into a cell of the table and a
		     long cell is the cost of it travelling with the words. -->
		{#if weight !== null}
			<span class="weight" title="What this drawing adds to the cell it is written into">/ {weight} KB</span>
		{/if}
	</div>

	<!-- The checks show through where nothing has been drawn: an area's fill and
	     the paper behind it will, and a white square instead of a transparent one
	     is a thing you only find out about on paper. One check to a pixel, so the
	     pattern is also the grid. The stage is measured, and the board drawn as
	     large as fits in it. -->
	<div class="stage" bind:clientWidth={room.w} bind:clientHeight={room.h}>
		<div class="sheet" style="width:{grid.w * zoom}px;height:{grid.h * zoom}px">
			<canvas
				class:dark={checks === 'dark'}
				class:cropping
				use:start
				width={grid.w}
				height={grid.h}
				style="--check:{zoom}px"
				onpointerdown={down}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
			></canvas>
			{#if cropping && cropPixels}
				<span
					class="crop-frame"
					style="left:{(cropPixels.x / grid.w) * 100}%;top:{(cropPixels.y / grid.h) * 100}%;width:{(cropPixels.w / grid.w) * 100}%;height:{(cropPixels.h / grid.h) * 100}%"
				></span>
			{/if}
		</div>
	</div>

	<!-- Two rows. What you draw with — the tool, the nib, undo, and the paper
	     to see it on — and under it what you do to the whole board, with the
	     three ways out at the far end: Delete, then Cancel and Done. -->
	<div class="tools" role="toolbar" aria-label="Drawing tools">
		<span class="segmented">
			<button
				aria-pressed={tool === 'pen'}
				title="Draw"
				aria-label="Draw"
				onclick={() => pick('pen')}
			>
				<!-- The pencil the Draw buttons wear, drawn in the ink it puts down:
				     the tool and the colour in one glyph. -->
				<span class="ink" style="color:{color}"><Icon name="edit" size={16} /></span>
			</button>
			<button
				aria-pressed={tool === 'line'}
				title="Straight line — press where it starts and let go where it ends"
				aria-label="Line"
				onclick={() => pick('line')}
			>
				<Icon name="line" size={16} />
			</button>
			<!-- The two shapes are drawn on their buttons as what they will draw,
			     so the button says whether the next one is free or even. -->
			<button
				aria-pressed={tool === 'rect'}
				title={square
					? 'Square — drag from corner to corner. Press twice for any rectangle; Shift for one'
					: 'Rectangle — drag from corner to corner. Press twice for squares; Shift for one'}
				aria-label={square ? 'Square' : 'Rectangle'}
				onclick={() => pick('rect')}
			>
				<span class="outline" class:even={square}></span>
			</button>
			<button
				aria-pressed={tool === 'ellipse'}
				title={circle
					? 'Circle — drag across it. Press twice for any ellipse; Shift for one'
					: 'Ellipse — drag across it. Press twice for circles; Shift for one'}
				aria-label={circle ? 'Circle' : 'Ellipse'}
				onclick={() => pick('ellipse')}
			>
				<span class="outline round" class:even={circle}></span>
			</button>
			<button
				aria-pressed={tool === 'eraser'}
				title="Rub out — back to the paper, not to white"
				aria-label="Erase"
				onclick={() => pick('eraser')}
			>
				<Icon name="erase" size={16} />
			</button>
		</span>

		<!-- The weight drawn rather than numbered: a nib is a square of pixels, and
		     a square of pixels is the thing to put on the button. One button,
		     going round the three; the number is in the title. Then the colour,
		     the same size, which starts as the area's own. -->
		<span class="segmented">
			<button
				title="{nib} pixel{nib === 1 ? '' : 's'} wide — press for {nib === NIBS.at(-1) ? 'the thinnest' : 'wider'}"
				aria-label="Nib, {nib} pixel{nib === 1 ? '' : 's'}"
				onclick={nextNib}
			>
				<span
					class="nib"
					class:hollow={tool === 'eraser'}
					style="width:{2 + nib * 3}px;height:{2 + nib * 3}px;{tool === 'eraser' ? '' : `background:${color}`}"
				></span>
			</button>
			<input
				type="color"
				class="swatch"
				value={color}
				oninput={(e) => {
					color = e.currentTarget.value;
					if (tool === 'eraser') tool = 'pen';
				}}
				title="The colour to draw in — it starts as this area's own"
				aria-label="Color to draw in"
			/>
		</span>


	</div>

	<!-- Undo and redo, at the far left of the panel's bottom bar. -->
		<span class="segmented undo" use:portal={bar}>
			<button onclick={undo} disabled={!history.length} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
				<Icon name="undo" size={16} />
			</button>
			<button onclick={redo} disabled={!future.length} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
				<Icon name="redo" size={16} />
			</button>
		</span>

	<div class="tools second" role="toolbar" aria-label="Board">
		<!-- The ones that redraw the whole board rather than a pixel of it. All
		     are one undo away, board and all. -->
		<span class="segmented">
			<button onclick={rotate} title="Turn the drawing a quarter turn clockwise" aria-label="Rotate">
				<Icon name="rotate" size={16} />
			</button>
			<button onclick={() => flip('x')} title="Flip the drawing left to right" aria-label="Flip horizontally">
				<Icon name="reflect-horizontal" size={16} />
			</button>
			<button onclick={() => flip('y')} title="Flip the drawing upside down" aria-label="Flip vertically">
				<Icon name="reflect-vertical" size={16} />
			</button>
			<button
				aria-pressed={cropping}
				onclick={toggleCrop}
				title={cropping ? 'Stop cropping' : 'Crop — drag a frame over the board'}
				aria-label="Crop"
			>
				<Icon name="crop" size={16} />
			</button>
		</span>
		{#if cropping}
			<button class="apply" disabled={!cropPixels} onclick={applyCrop} title="Keep only what is inside the frame">
				Apply Crop
			</button>
		{/if}

		<span class="segmented">
			<button onclick={copy} title="Copy the drawing as an image (Ctrl/Cmd+C)" aria-label="Copy">
				<Icon name="copy" size={16} />
			</button>
			<button
				onclick={paste}
				title="Paste an image from the clipboard — it replaces the board and brings its own size (Ctrl/Cmd+V)"
				aria-label="Paste"
			>
				<Icon name="paste" size={16} />
			</button>
		</span>

	</div>
</div>

<style>
	/* In the side panel's room: no frame, no shadow — the panel is the frame. */
	.drawer {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font: 13px ui-sans-serif, system-ui, sans-serif;
		outline: none;
		/* The board takes the pointer for drawing; a downward drag read as
		   pull-to-refresh would take the undo history with it. */
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.weight {
		color: #767676;
		font-size: 12px;
	}

	.board {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	/* None of the row gives way: a narrow head squeezed the paper toggle into
	   a tall, thin button. The weight, last, is what runs out of room. */
	.board > :global(*) {
		flex: none;
	}

	/* The paper toggle, sized and drawn as the tools below are. */
	.board .square {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: 28px;
		height: 28px;
		aspect-ratio: 1;
		margin-right: 6px;
		padding: 0;
		border: 1px solid #c9cdd4;
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
	}

	.board .square[aria-pressed='true'] {
		background: var(--accent-tint);
		border-color: var(--accent);
		color: var(--accent-strong);
	}

	/* Centred under the board, which is centred in its room. */
	.tools {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		flex-wrap: wrap;
		/* Never squeezed: when the tray is pulled down, the board keeps its
		   least and the rows slide under the panel's bottom bar instead. */
		flex: none;
	}

	.tools .apply {
		width: auto;
		padding: 0 10px;
	}

	/* Square, all of them: every one holds a glyph of the same size, and a row of
	   squares reads as a row of tools rather than as words of different lengths.
	   Undo and redo too, which live in the panel's bottom bar. */
	.tools button,
	.undo button {
		font: 600 13px ui-sans-serif, system-ui, sans-serif;
		background: #fff;
		border: 1px solid #c9cdd4;
		border-radius: 6px;
		padding: 0;
		cursor: pointer;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
	}

	.tools button[aria-pressed='true'] {
		background: var(--accent-tint);
		border-color: var(--accent);
		color: var(--accent-strong);
	}

	.tools button:disabled,
	.undo button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.segmented {
		display: flex;
		gap: 4px;
	}

	.board input {
		font: 13px ui-sans-serif, system-ui, sans-serif;
		width: 48px;
		height: 28px;
		box-sizing: border-box;
		border: 1px solid #c9cdd4;
		border-radius: 6px;
		padding: 0 4px;
		text-align: center;
		/* The spin buttons are what made a three-digit field cut its own number
		   off — the same bargain the options bar struck. Arrow keys still step. */
		appearance: textfield;
	}

	.board input::-webkit-outer-spin-button,
	.board input::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.by {
		color: #767676;
		font: 13px ui-sans-serif, system-ui, sans-serif;
	}

	/* The pencil, in the ink. No shadow round it: a half-pixel drop shadow is a
	   blur, and it was what made the pencil the one soft icon in the row. */
	.ink {
		display: grid;
		place-items: center;
	}

	/* The shapes on their buttons: a rectangle or an ellipse, or with the
	   second press a square or a circle. */
	.outline {
		display: block;
		box-sizing: border-box;
		width: 16px;
		height: 11px;
		border: 1.5px solid currentColor;
	}

	.outline.even {
		width: 13px;
		height: 13px;
	}

	.outline.round {
		border-radius: 50%;
	}

	/* The colour, as square as the buttons beside it. */
	.swatch {
		box-sizing: border-box;
		width: 30px;
		height: 30px;
		padding: 2px;
		border: 1px solid #c9cdd4;
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
	}

	.swatch::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.swatch::-webkit-color-swatch {
		border: none;
		border-radius: 3px;
	}

	.swatch::-moz-color-swatch {
		border: none;
		border-radius: 3px;
	}

	/* The weight, drawn: 1, 2 and 4 pixels as squares that grow with them, in
	   the ink they will actually put down. */
	.nib {
		border-radius: 1px;
	}

	/* And an outline of one while the rubber is up, because what that puts down
	   is nothing: a filled square would say the opposite of what the tool does. */
	.nib.hollow {
		border: 1px solid #767676;
		box-sizing: border-box;
		background: transparent;
	}

	/* The room the board is fitted to: whatever the dialog has left once the
	   header, the size and the tools are placed. Never scrolls — the zoom is
	   worked out from this box's own size so the board always fits. */
	.stage {
		flex: 1 1 0;
		min-height: 96px;
		display: grid;
		place-items: center;
		overflow: hidden;
		line-height: 0;
	}

	.sheet {
		position: relative;
		overflow: hidden;
		box-shadow: 0 0 0 1px #c9cdd4;
	}

	.sheet canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	canvas.cropping {
		cursor: crosshair;
	}

	/* What stays, lit; what goes, dimmed by the frame's own shadow — as the
	   Images tray draws its crop. Clipped to the board by the stage. */
	.crop-frame {
		position: absolute;
		border: 1px dashed #fff;
		outline: 1px solid var(--accent);
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
		pointer-events: none;
	}

	canvas {
		/* Drawn hard: a smoothed pixel is a
		   different drawing from the one that will print. */
		image-rendering: pixelated;
		cursor: crosshair;
		--check-a: #fff;
		--check-b: #e9edf3;
		background-color: var(--check-a);
		background-image:
			linear-gradient(45deg, var(--check-b) 25%, transparent 25%),
			linear-gradient(-45deg, var(--check-b) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--check-b) 75%),
			linear-gradient(-45deg, transparent 75%, var(--check-b) 75%);
		/* A check per pixel of the board: the four gradients make squares of half
		   the tile, so the tile is two pixels across. */
		background-size: calc(var(--check) * 2) calc(var(--check) * 2);
		background-position: 0 0, 0 var(--check), var(--check) calc(var(--check) * -1),
			calc(var(--check) * -1) 0;
		touch-action: none;
	}

	/* The other paper. Dark enough that white ink reads on it, and still two
	   tones rather than one, because a flat ground would stop saying which
	   pixels are transparent. */
	canvas.dark {
		--check-a: #3a4150;
		--check-b: #2b313c;
	}
</style>
