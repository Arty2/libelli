<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import MenuSelect, { familyItems } from './MenuSelect.svelte';
	import { armDefault } from '$lib/modal';
	import { local } from '$lib/storage';
	import { downloadUrl, slugify } from '$lib/download';
	import { editableType, frameBetween, framePixels, isCrop, type Frame } from '$lib/photo';
	import {
		chooseImageFolder,
		deleteImage,
		weigh,
		folderAvailable,
		forgetImageFolder,
		folderImages,
		imageFolder,
		listBrowserImages,
		reopenImageFolder,
		storeLocalImage,
		type FolderState,
		type ImageRecord
	} from '$lib/assets';
	import { fontStack, type FontEntry, type FontTune } from '$lib/fonts';
	import { FONT_KINDS, type FontKind } from '$lib/types';

	/**
	 * Where the pictures are, what they weigh, and how to get rid of them.
	 *
	 * The app can hold a run of photographs, and until there was a bar like
	 * this they were invisible: browser storage is a bucket you cannot look
	 * into, and the only way to clear it was to clear everything the app had
	 * ever saved. So: a list, a weight against each one, and a folder to put
	 * them in instead where the browser offers one.
	 */

	interface Props {
		/** names the current table and template actually point at */
		used: Set<string>;
		/** names pointed at that this browser does not hold: listed, to be put back */
		missing?: string[];
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
		/** the pictures changed: whoever resolved them should do it again */
		onchanged: () => void;
		/** a picture carried out of the bar and let go over an area */
		onplace: (boxId: string, name: string) => void;
		/** …or over the page but no area: a new area for it, where it was let go */
		onplacepage: (name: string, clientX: number, clientY: number) => void;
		/** the tray's height pulled by its head, on a phone — the table's own gesture */
		ontraydrag?: (phase: 'start' | 'move' | 'end', clientY: number) => void;
		/**
		 * The picture shown large in place of the list, if any — asked for by a
		 * table cell that points at it, or by a tap on its thumbnail here.
		 */
		focus?: string | null;
		onfocus?: (name: string | null) => void;
		/**
		 * The pictures that live in the table's cells and on areas rather than
		 * in storage — drawings, mostly — listed under the stored ones so every
		 * picture the card uses is in one place. Pressed, one opens in the
		 * drawing editor it belongs to.
		 */
		drawings?: Array<{ key: string; label: string; where: string; src: string }>;
		onopendrawing?: (key: string) => void;
		/**
		 * The fonts the design names and this browser holds — `fontInventory` —
		 * listed after the pictures for the same reason they are: the one place
		 * to see what a design needs that a file cannot carry, and to supply or
		 * swap it.
		 */
		fonts?: FontEntry[];
		/** what a font can be replaced with: the font menus' own families (`fontChoices`) */
		fontFamilies?: { local: string[]; google: string[]; system: string[] };
		/** a Replace menu opening: fetch the faces its names are set in, as the font menus do */
		onfontsopen?: () => void;
		/** the kind a face's fallback is chosen by, changed — everywhere it is used */
		ontune?: (family: string, change: FontTune) => void;
		/** a file chosen for a font, to be installed under that font's own name */
		onfontfile?: (family: string, file: File) => void;
		/** every use of one family swapped for another; false, or a promise of it, when it was refused */
		onreplacefont?: (from: string, to: string) => boolean | void | Promise<boolean | void>;

		ondeletefont?: (font: FontEntry) => void;
	}

	let {
		used,
		missing = [],
		onnotice,
		onchanged,
		onplace,
		onplacepage,
		ontraydrag,
		focus = null,
		drawings = [],
		onopendrawing,
		onfocus,
		fonts = [],
		fontFamilies = { local: [], google: [], system: [] },
		onfontsopen,
		ontune,
		onfontfile,
		onreplacefont,
		ondeletefont
	}: Props = $props();

	/**
	 * The fonts in the order they were first shown, and the one a replace
	 * just put in: the inventory sorts by name, so a replacement jumped to
	 * wherever its name fell and the person lost their place in the list.
	 * Here it takes the replaced font's row, outlined to say so. Both live as
	 * long as the panel — opened again, the list is in its own order and
	 * nothing is outlined. Lower case, as fonts.ts matches families.
	 */
	let fontOrder = $state<string[]>([]);

	/** A kind of face, as the Type menu names it. */
	const KIND_NAMES: Record<FontKind, string> = {
		serif: 'Serif',
		'sans-serif': 'Sans Serif',
		monospace: 'Monospaced',
		handwriting: 'Cursive'
	};

	/** Replace's first item: not a family — a name no family can have. */
	const UPLOAD = '\u0000upload';
	/** Plain: the picker takes every common font format, so naming them adds nothing. */
	const UPLOAD_LABEL = 'Upload…';

	/**
	 * The sections folded shut — `images`, `drawings`, `fonts` — kept in this
	 * browser, so the tray opens as it was left: a person who never draws
	 * need not scroll past the drawings to reach the fonts every time.
	 */
	const COLLAPSED_KEY = 'images-collapsed';
	const stored = local.get<unknown>(COLLAPSED_KEY, []);
	let collapsed = $state<string[]>(Array.isArray(stored) ? stored.filter((k): k is string => typeof k === 'string') : []);
	function toggleSection(key: string) {
		collapsed = collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key];
		local.set(COLLAPSED_KEY, collapsed);
	}

	/**
	 * The font whose row is outlined, and so shows its Type: the one a
	 * replace just put in, or the one last tapped. One at a time, so the list
	 * stays a list of names; gone, like the order, when the panel closes.
	 */
	let outlinedFont = $state<string | null>(null);
	$effect(() => {
		if (!fontOrder.length && fonts.length) fontOrder = fonts.map((f) => f.family.toLowerCase());
	});
	/** As first shown; a font that arrived since (an upload) after them, in the inventory's order. */
	const shownFonts = $derived.by(() => {
		const rank = new Map(fontOrder.map((family, i) => [family, i]));
		const at = (f: FontEntry) => rank.get(f.family.toLowerCase()) ?? Infinity;
		return [...fonts].sort((a, b) => at(a) - at(b));
	});

	async function replaceFontKeepingPlace(from: string, to: string) {
		if ((await onreplacefont?.(from, to)) === false) return;
		const was = from.toLowerCase();
		const now = to.toLowerCase();
		// Into the old font's row; or, when the replacement was already in
		// the list, the old row simply goes and the replacement keeps its own.
		fontOrder = fontOrder.includes(now) ? fontOrder.filter((f) => f !== was) : fontOrder.map((f) => (f === was ? now : f));
		outlinedFont = now;
	}


	/** The font a file is being chosen for: supplied under its own name, so the design finds it. */
	let fontInput = $state<HTMLInputElement | null>(null);
	let fontFor = $state<string | null>(null);

	function chooseFontFile(family: string) {
		fontFor = family;
		fontInput?.click();
	}

	function fontChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		const family = fontFor;
		fontFor = null;
		if (file && family) onfontfile?.(family, file);
	}

	/**
	 * Deleting a font asks, as deleting a picture does: the file is in no undo,
	 * and "unused" is this design's word — another design in the library may
	 * be set in it, and would find it missing.
	 */
	let confirmingFont = $state<FontEntry | null>(null);

	/**
	 * Said only where it matters: a file kept in this browser — the thing a
	 * design cannot carry to another computer — or one it needs and has not got.
	 * A family fetched from Google by name travels with the design, and says
	 * nothing.
	 */
	const FONT_STATUS: Record<FontEntry['status'], string> = {
		uploaded: 'local',
		google: '',
		system: '',
		missing: 'missing',
		unused: 'local · unused'
	};

	/**
	 * A picture the design points at and this browser does not hold — a table
	 * brought from elsewhere, a folder not opened, a picture deleted. It stays
	 * in the list as a placeholder with a way to put the file back, under the
	 * name that is pointed at: the file's own name on this device rarely is it.
	 */
	let replaceInput = $state<HTMLInputElement | null>(null);
	let replacing = $state<string | null>(null);

	/** Whether the file being chosen supplies a missing picture or replaces one that is here. */
	let replacingPresent = false;

	function findFor(name: string, present = false) {
		replacing = name;
		replacingPresent = present;
		replaceInput?.click();
	}

	async function putBack(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		const name = replacing;
		replacing = null;
		if (!file || !name) return;
		await storeLocalImage(file, name);
		await refresh();
		onchanged();
		onnotice(replacingPresent ? `${name} is now ${file.name} — everything showing it shows the new one.` : `${name} is back, from ${file.name}.`);
	}

	/**
	 * Deleting asks, and says why: a picture's bytes are not in the app's undo
	 * — a snapshot is template and table, and the picture is neither — so this
	 * is the one delete in the app that undo cannot reach.
	 */
	let confirming = $state<ImageRecord | null>(null);

	/** The head, pulled: the same hand-off the table's header row makes. */
	let traying: number | null = null;

	function startTrayDrag(event: PointerEvent) {
		if (!ontraydrag || event.button !== 0) return;
		if ((event.target as HTMLElement).closest('input, button, label')) return;
		traying = event.pointerId;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		ontraydrag('start', event.clientY);
	}

	function moveTrayDrag(event: PointerEvent) {
		if (traying === event.pointerId) ontraydrag?.('move', event.clientY);
	}

	function endTrayDrag(event: PointerEvent) {
		if (traying !== event.pointerId) return;
		traying = null;
		ontraydrag?.('end', event.clientY);
	}

	const available = folderAvailable();
	let folder = $state<FolderState | null>(null);
	/** What this browser holds itself, and what the folder does: read apart, as they arrive apart. */
	let held = $state<ImageRecord[]>([]);
	let inFolder = $state<ImageRecord[]>([]);
	/** Only until this browser's own are listed: the folder is never waited on. */
	let busy = $state(true);
	/** The folder is still being read; the list fills as it is. */
	let reading = $state(false);

	/**
	 * Every image, the folder's first: a name in both places is the folder's,
	 * because that is the copy a card is drawn from (`resolveLocalImages`).
	 */
	const images = $derived.by(() => {
		const seen = new Set(inFolder.map((image) => image.name.toLowerCase()));
		return [...inFolder, ...held.filter((image) => !seen.has(image.name.toLowerCase()))];
	});
	/** Object URLs for the thumbnails, by name — the same cache the card reads. */
	const urls = $derived(Object.fromEntries(images.flatMap((image) => (image.url ? [[image.name, image.url]] : []))));
	/** Pixel sizes, read off each thumbnail as it loads. Written into, not spread: one a picture. */
	let sizes = $state<Record<string, { w: number; h: number }>>({});

	/**
	 * Looked again. A folder of a few hundred photographs takes a while to
	 * read, so the tray does not wait for it: this browser's own are listed at
	 * once, the folder's arrive a batch at a time behind them, and everything
	 * else in the app goes on meanwhile. A refresh begun while another is
	 * still reading takes over from it — the older one stops where it is.
	 */
	let refreshes = 0;

	async function refresh() {
		const run = ++refreshes;
		folder = await imageFolder();
		const browser = await listBrowserImages();
		if (run !== refreshes) return;
		held = browser;
		busy = false;
		if (!folder?.ready) {
			inFolder = [];
			reading = false;
			return;
		}
		reading = true;
		const found: ImageRecord[] = [];
		for await (const batch of folderImages()) {
			if (run !== refreshes) return;
			found.push(...batch);
			inFolder = [...found];
		}
		if (run !== refreshes) return;
		inFolder = found;
		reading = false;
	}

	/**
	 * Pictures in from a file picker. The folder is Chromium's alone, and
	 * until this there was no way to put a picture into this browser from a
	 * phone except dropping a file on an area — which a phone cannot do. Where
	 * they go is where every picture goes: the folder when there is one, this
	 * browser otherwise.
	 */
	let fileInput = $state<HTMLInputElement | null>(null);

	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])].filter((file) => file.type.startsWith('image/'));
		input.value = '';
		if (!files.length) return;
		const names: string[] = [];
		for (const file of files) names.push(await storeLocalImage(file));
		await refresh();
		onchanged();
		onnotice(
			`${names.length === 1 ? names[0] : `${names.length} images`} added. Drag ${names.length === 1 ? 'it' : 'one'} onto an area to put it there, or onto the page for an area of its own.`
		);
	}

	/**
	 * Carrying a picture onto an area.
	 *
	 * Pointer events rather than HTML drag and drop, which a touchscreen does
	 * not do — and a phone is where this bar is the only way to put a picture
	 * on a card. The thumbnail is the grip: a press that travels is a carry,
	 * and where it is let go the element under the finger says which area, by
	 * the same `data-box-id` the card puts on every area.
	 */
	const CARRY_SLOP = 6;
	let carry = $state<{ id: number; name: string; x: number; y: number; on: boolean } | null>(null);

	function startCarry(event: PointerEvent, name: string) {
		if (event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		carry = { id: event.pointerId, name, x: event.clientX, y: event.clientY, on: false };
	}

	/**
	 * The area the picture would land in, marked while it is carried — the
	 * same promise a file dragged in from outside gets. An attribute rather
	 * than a class, because the card renders its areas' classes itself and
	 * would take a foreign one off again; the card's stylesheet draws it.
	 */
	let target: HTMLElement | null = null;

	function aim(x: number, y: number): HTMLElement | null {
		const area = document.elementFromPoint(x, y)?.closest<HTMLElement>('.trim [data-box-id]') ?? null;
		if (area === target) return area;
		target?.removeAttribute('data-image-target');
		area?.setAttribute('data-image-target', '');
		target = area;
		return area;
	}

	function moveCarry(event: PointerEvent) {
		if (!carry || carry.id !== event.pointerId) return;
		if (!carry.on && Math.hypot(event.clientX - carry.x, event.clientY - carry.y) < CARRY_SLOP) return;
		carry = { ...carry, x: event.clientX, y: event.clientY, on: true };
		aim(event.clientX, event.clientY);
	}

	function endCarry(event: PointerEvent) {
		if (!carry || carry.id !== event.pointerId) return;
		const { on, name } = carry;
		carry = null;
		if (!on || event.type === 'pointercancel') {
			aim(-1, -1);
			// A press that went nowhere is a look, not a carry: the picture large.
			if (!on && event.type !== 'pointercancel') onfocus?.(name);
			return;
		}
		const area = aim(event.clientX, event.clientY);
		aim(-1, -1);
		if (area?.dataset.boxId) onplace(area.dataset.boxId, name);
		else if (document.elementFromPoint(event.clientX, event.clientY)?.closest('.viewport .sheet'))
			onplacepage(name, event.clientX, event.clientY);
		else onnotice('Let go over the page to put the image on it — over an area to put it in that one.');
	}

	$effect(() => {
		void refresh();
	});

	const total = $derived(images.reduce((sum, image) => sum + image.bytes, 0));

	/**
	 * Unused first, then by name: the list is mostly consulted to clear out
	 * what nothing points at, so that is what should be at the top. A filter
	 * appears once there are enough pictures to need one.
	 */
	const FILTER_FROM = 8;
	let filter = $state('');
	const byUse = (a: ImageRecord, b: ImageRecord) =>
		Number(used.has(a.name)) - Number(used.has(b.name)) || a.name.localeCompare(b.name);
	const matches = (image: ImageRecord) => !filter.trim() || image.name.toLowerCase().includes(filter.trim().toLowerCase());
	const shownFolder = $derived(images.filter((image) => image.where === 'folder' && matches(image)).sort(byUse));
	const shownHeld = $derived(images.filter((image) => image.where === 'browser' && matches(image)).sort(byUse));
	/** In the order they are listed, for the large view's pager. */
	const shown = $derived([...shownFolder, ...shownHeld]);

	/**
	 * The folder is one line, folded, until it is opened: a folder of
	 * photographs is often most of what there is, and listed in full it pushed
	 * this browser's own pictures, the drawings and the fonts out of sight.
	 * Its contents show while a search is typed, since they may be what is
	 * being looked for. Kept in this browser, as the sections' folds are.
	 */
	const FOLDER_OPEN_KEY = 'images-folder-open';
	let folderOpen = $state(local.get<unknown>(FOLDER_OPEN_KEY, false) === true);
	function toggleFolder() {
		folderOpen = !folderOpen;
		local.set(FOLDER_OPEN_KEY, folderOpen);
	}
	const folderShown = $derived(folderOpen || !!filter.trim());
	const folderTotal = $derived(shownFolder.reduce((sum, image) => sum + image.bytes, 0));

	/**
	 * What a drawing is saved as: where it is, and the type its data URL says —
	 * `link-row-1.png`. The type is read off the URL, which has already been
	 * through `safeMediaUrl`, so it is one of the picture types or nothing.
	 */
	function drawingFile(drawing: { label: string; where: string; src: string }) {
		const type = drawing.src.match(/^data:image\/([a-z0-9.+-]+)/i)?.[1]?.toLowerCase() ?? 'png';
		const ext = type === 'jpeg' ? 'jpg' : type === 'svg+xml' ? 'svg' : type;
		return `${slugify(`${drawing.label} ${drawing.where}`)}.${ext}`;
	}

	/** A drawing's pixels, read off its thumbnail as it loads. */
	let drawnSizes = $state<Record<string, { w: number; h: number }>>({});

	async function choose() {
		const chosen = await chooseImageFolder();
		if (!chosen) return;
		onnotice(`Images go into ${chosen.name} from now on. The ones already in this browser stay where they are.`);
		await refresh();
		onchanged();
	}

	async function reopen() {
		const state = await reopenImageFolder();
		if (!state?.ready) {
			onnotice('That folder was not opened, so images are coming from this browser.', 'warning');
			return;
		}
		await refresh();
		onchanged();
	}

	async function forget() {
		await forgetImageFolder();
		onnotice('Folder disconnected. Nothing in it was deleted — this app has simply stopped reading it.');
		await refresh();
		onchanged();
	}

	async function remove(image: ImageRecord) {
		await deleteImage(image.name, image.where);
		// Deleted from its own large view: there is nothing left to look at.
		if (image.name === focus) onfocus?.(null);
		onnotice(
			`${image.name} deleted.` +
				(used.has(image.name) ? ' The areas pointing at it will draw nothing until it is put back.' : '')
		);
		await refresh();
		onchanged();
	}

	// ---- one picture, large -------------------------------------------------

	/**
	 * A stored picture, as large as the tray allows, with the few things worth
	 * doing to a photograph in a card: turn it, crop it. Nothing is written
	 * until Save — these are the picture's own bytes, which the app's undo
	 * cannot reach (see the delete, above) — and Revert goes back to what is
	 * stored. The name stays: it is what cells point at, so every card using
	 * the picture shows the edit.
	 *
	 * Drawn on a canvas at the picture's own size and shown scaled to fit; the
	 * crop frame is fractions of it, so it means the same at either size.
	 */
	let view = $state<HTMLCanvasElement | null>(null);
	let dims = $state({ w: 0, h: 0 });
	let room = $state({ w: 0, h: 0 });
	let dirty = $state(false);
	let saving = $state(false);
	let cropping = $state(false);
	let frame = $state<Frame | null>(null);
	let framing: { id: number; from: { x: number; y: number } } | null = null;

	const focusType = $derived(focus ? editableType(focus) : null);
	const focusUrl = $derived(focus ? (urls[focus] ?? null) : null);
	const scale = $derived(
		dims.w && dims.h && room.w && room.h ? Math.min(room.w / dims.w, room.h / dims.h) : 0
	);

	/** Load the stored picture onto the board, forgetting any edit not saved. */
	function load(src: string) {
		const image = new Image();
		image.onload = () => {
			if (!view) return;
			view.width = image.naturalWidth;
			view.height = image.naturalHeight;
			view.getContext('2d')?.drawImage(image, 0, 0);
			dims = { w: image.naturalWidth, h: image.naturalHeight };
			sizes = { ...sizes, [focus ?? '']: { ...dims } };
			dirty = false;
			frame = null;
			cropping = false;
		};
		image.src = src;
	}

	$effect(() => {
		const src = focusUrl;
		const canvas = view;
		if (src && canvas) load(src);
	});

	/** The board redrawn onto one of a new size — what both edits come down to. */
	function redraw(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, from: HTMLCanvasElement) => void) {
		if (!view) return;
		const from = document.createElement('canvas');
		from.width = view.width;
		from.height = view.height;
		from.getContext('2d')?.drawImage(view, 0, 0);
		view.width = w;
		view.height = h;
		const ctx = view.getContext('2d');
		if (!ctx) return;
		draw(ctx, from);
		dims = { w, h };
		dirty = true;
	}

	/**
	 * A quarter turn clockwise; the picture's sides trade places. One way only,
	 * as the drawing editor turns: three presses are the other way, and one
	 * button fewer is a row that fits a phone.
	 */
	function turn() {
		if (!view) return;
		const { width, height } = view;
		redraw(height, width, (ctx, from) => {
			ctx.translate(height, 0);
			ctx.rotate(Math.PI / 2);
			ctx.drawImage(from, 0, 0);
		});
		frame = null;
	}

	/** Mirrored left to right, or top to bottom; the size stays. */
	function flip(axis: 'x' | 'y') {
		if (!view) return;
		const { width, height } = view;
		redraw(width, height, (ctx, from) => {
			ctx.translate(axis === 'x' ? width : 0, axis === 'y' ? height : 0);
			ctx.scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1);
			ctx.drawImage(from, 0, 0);
		});
		frame = null;
	}

	function applyCrop() {
		if (!view || !isCrop(frame)) return;
		const px = framePixels(frame, view.width, view.height);
		redraw(px.w, px.h, (ctx, from) => ctx.drawImage(from, -px.x, -px.y));
		frame = null;
		cropping = false;
	}

	const fractionAt = (event: PointerEvent) => {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
	};

	function startFrame(event: PointerEvent) {
		if (!cropping || event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		const from = fractionAt(event);
		framing = { id: event.pointerId, from };
		frame = frameBetween(from, from);
	}

	function moveFrame(event: PointerEvent) {
		if (framing?.id !== event.pointerId) return;
		frame = frameBetween(framing.from, fractionAt(event));
	}

	function endFrame(event: PointerEvent) {
		if (framing?.id !== event.pointerId) return;
		framing = null;
		if (!isCrop(frame)) frame = null;
	}

	async function save() {
		if (!view || !focus || !focusType || saving) return;
		const name = focus;
		const type = focusType;
		saving = true;
		try {
			const blob = await new Promise<Blob | null>((done) => view!.toBlob(done, type, 0.92));
			// A browser that cannot write the type asked for hands back a PNG
			// instead, and a PNG under a .webp name is a file that lies about
			// itself. Refused rather than written.
			if (!blob || blob.type !== type) {
				onnotice(`This browser cannot write ${type.replace('image/', '').toUpperCase()} files, so ${name} was left as it was.`, 'warning');
				return;
			}
			await storeLocalImage(new File([blob], name, { type }), name);
			dirty = false;
			await refresh();
			onchanged();
			onnotice(`${name} saved — every card showing it shows the edit.`);
		} finally {
			saving = false;
		}
	}

	/** What the large view is showing, as the list holds it — for its Delete. */
	const focusRecord = $derived(focus ? (images.find((image) => image.name === focus) ?? null) : null);

	/** The stored pictures in the list's order, for the viewer's pager. */
	const focusIndex = $derived(focus ? shown.findIndex((image) => image.name === focus) : -1);

	function step(by: number) {
		const next = shown[focusIndex + by];
		if (next) onfocus?.(next.name);
	}
</script>

<!--
	A tray in the table's place, not a bar and not a dialog: the pictures are
	looked at beside the card that uses them, and a list of them wants the
	height a bar in the options row could never give it. One tray at a time —
	this or the table — in the same room, at the same width or height. What
	is stored and what it weighs at the top; the ways in on the Images head,
	since they are the images' alone.
-->
<section class="images-tray" aria-label="Pictures">
	<!-- The head is also the tray's grip on a phone, as the table's header
	     row is: pulled up or down, it shares the height with the page. -->
	<div
		class="tray-head"
		role="presentation"
		class:grip={!!ontraydrag}
		onpointerdown={startTrayDrag}
		onpointermove={moveTrayDrag}
		onpointerup={endTrayDrag}
		onpointercancel={endTrayDrag}
	>
		{#if focus}
			<button
				class="back"
				title={dirty ? 'Save or revert the edit first' : 'Back to every image'}
				aria-label="Back to every image"
				disabled={dirty}
				onclick={() => onfocus?.(null)}
			><Icon name="chevron-left" size={14} /></button>
			<span class="context focus-name" title={focus}>{focus}</span>
			<!-- The size as it stands, edits and all: a crop is judged by it. -->
			{#if focusType && dims.w}
				<span class="total">{dims.w} × {dims.h} px</span>
			{:else if sizes[focus]}
				<span class="total">{sizes[focus].w} × {sizes[focus].h} px</span>
			{/if}
			{#if dirty}<span class="tag">edited</span>{/if}
		{:else}
		<span class="context">Pictures</span>
		{/if}
		{#if images.length >= FILTER_FROM && !focus}
			<label class="find">
				<span class="sr-only">Find an image</span>
				<input type="search" placeholder="Find…" bind:value={filter} />
			</label>
		{/if}
	</div>

	{#if focus}
		<!-- The picture, large, where the list was. -->
		<div class="viewer" bind:clientWidth={room.w} bind:clientHeight={room.h}>
			{#if !focusUrl}
				<p class="empty">
					{busy || reading ? '…' : `${focus} is not in this browser.`}
					{#if !busy && !reading && missing.includes(focus)}
						<button class="find" onclick={() => findFor(focus!)}><Icon name="image-reference" size={13} /> Find…</button>
					{/if}
				</p>
			{:else if !focusType}
				<img class="large" src={focusUrl} alt={focus} />
			{/if}
			<!-- Always in the page while an editable picture is open, so the load
			     has somewhere to draw; sized by hand to fit the room. -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="board"
				class:cropping
				hidden={!focusUrl || !focusType}
				style="width:{dims.w * scale}px;height:{dims.h * scale}px"
				onpointerdown={startFrame}
				onpointermove={moveFrame}
				onpointerup={endFrame}
				onpointercancel={endFrame}
			>
				<canvas bind:this={view}></canvas>
				{#if cropping && frame}
					<span
						class="crop-frame"
						style="left:{frame.x * 100}%;top:{frame.y * 100}%;width:{frame.w * 100}%;height:{frame.h * 100}%"
					></span>
				{/if}
			</div>
		</div>
	{:else}
	<div class="list">
		<!-- A section's head is its fold: its name, how many and how much, and a
		     caret that says which way it is. -->
		{#snippet sectionHead(key: string, label: string, total: string, actions?: Snippet)}
			<h3 class="section">
				<!-- After the name, as an accordion's: down to open what is folded,
				     up to fold what is open. -->
				<button class="section-toggle" aria-expanded={!collapsed.includes(key)} onclick={() => toggleSection(key)}>
					{label}
					<span class="total">{total}</span>
					<Icon name={collapsed.includes(key) ? 'chevron-down' : 'chevron-up'} size={18} />
				</button>
				{#if actions}<span class="section-actions">{@render actions()}</span>{/if}
			</h3>
		{/snippet}
		<!-- The ways in are the images' alone — a drawing is made in the table,
		     a font comes in on its own row — so they are on the images' head, at
		     its far end, rather than in a bar under every section. Upload is
		     every browser's, a phone included; the folder is Chromium's. -->
		{#snippet imageWays()}
			<button class="square save" title="Upload images from this device" aria-label="Upload images" onclick={() => fileInput?.click()}>
				<Icon name="upload" size={12} />
			</button>
			<!-- Once one is connected, the folder's own line carries it. Shown
			     where it cannot work too, off, so a phone or Firefox says why
			     there is no folder rather than leaving it to be wondered at. -->
			{#if !folder}
				<button
					class="square save"
					disabled={!available}
					title={available
						? "Keep images as ordinary files in a folder of your own, rather than in this browser's storage"
						: 'A folder of your own needs Chrome or Edge on a computer — this browser cannot keep images in one, so they stay in its own storage'}
					aria-label="Connect a folder"
					onclick={choose}><Icon name="folder" size={12} /></button
				>
			{/if}
		{/snippet}
		<!-- One picture a line: what it looks like, what it is called, how big
		     it is in pixels and in bytes, and whether anything uses it. The
		     thumbnail is also the handle it is carried onto an area by. Lazy,
		     and decoded off the main thread: a folder can be hundreds of
		     full-size photographs, and only the ones scrolled to are drawn. -->
		{#snippet imageRow(image: ImageRecord)}
			<li
				class:unused={!used.has(image.name)}
				class:in-folder={image.where === 'folder'}
				title="{image.name} — {image.where === 'folder' ? `in ${folder?.name ?? 'the folder'}` : 'in this browser'}, {used.has(image.name) ? 'in use' : 'unused'}"
			>
				<span
					class="thumb"
					class:carrying={carry?.on && carry.name === image.name}
					role="button"
					tabindex="-1"
					aria-label="Drag {image.name} onto an area"
					title="Drag onto an area, or onto the page for an area of its own"
					onpointerdown={(e) => startCarry(e, image.name)}
					onpointermove={moveCarry}
					onpointerup={endCarry}
					onpointercancel={endCarry}
				>
					{#if image.url}
						<img
							src={image.url}
							alt=""
							draggable="false"
							loading="lazy"
							decoding="async"
							onload={(e) => {
								const img = e.currentTarget as HTMLImageElement;
								sizes[image.name] = { w: img.naturalWidth, h: img.naturalHeight };
							}}
						/>
					{/if}
				</span>
				<span class="name">{image.name}</span>
				<span class="size">{[
					sizes[image.name] ? `${sizes[image.name].w} × ${sizes[image.name].h} px` : '',
					weigh(image.bytes)
				]
					.filter(Boolean)
					.join(' · ')}</span>
				{#if !used.has(image.name)}<span class="tag">unused</span>{/if}
				<!-- A new file under the same name: every card and page that shows
				     this picture shows the new one, with nothing to re-point. The
				     arrow out of a tray, as a font's upload is. -->
				<button
					class="square save"
					title="Replace {image.name} with another file, under the same name — everything showing it shows the new one"
					aria-label="Replace {image.name}"
					onclick={() => findFor(image.name, true)}
				>
					<Icon name="upload" size={12} />
				</button>
				{#if image.url}
					<button
						class="square save"
						title="Download {image.name}"
						aria-label="Download {image.name}"
						onclick={() => downloadUrl(image.name, image.url!)}
					>
						<Icon name="download" size={12} />
					</button>
				{/if}
				<button
					class="square"
					title="Delete {image.name}"
					aria-label="Delete {image.name}"
					onclick={() => (confirming = image)}
				>
					<Icon name="trash" size={12} />
				</button>
			</li>
		{/snippet}
		{#if busy}
			<p class="empty">…</p>
		{:else}
			<!-- The head is there with none, for its ways in. -->
			{@render sectionHead('images', 'Images', `${images.length + missing.length}${images.length ? ` · ${weigh(total)}` : ''}`, imageWays)}
			{#if !collapsed.includes('images')}
			{#if !images.length && !missing.length && !folder}
				<p class="empty">No images yet — upload one, or drop it on an area.</p>
			{/if}
			<ul class="images">
				<!-- The folder is one line — its name, how many, what they weigh —
				     and opens to its pictures, under it; this browser's own and the
				     missing follow, outside it. The line is also where it is opened
				     again after a restart, swapped, or disconnected. -->
				{#if folder}
					<li class="folder-line" class:shut={!folder.ready}>
						<button
							class="folder-toggle as-typed"
							aria-expanded={folder.ready ? folderShown : undefined}
							disabled={!folder.ready}
							title={folder.ready
								? `${folderShown ? 'Fold' : 'Show'} the images in ${folder.name}`
								: `${folder.name} is not open — the browser asks again after a restart`}
							onclick={toggleFolder}
						>
							<span class="thumb folder-thumb" aria-hidden="true"><Icon name="folder" size={16} /></span>
							<span class="name">{folder.name}</span>
							<span class="size">
								{#if !folder.ready}
									not opened
								{:else if reading}
									{shownFolder.length ? `${shownFolder.length} so far…` : 'reading…'}
								{:else}
									{shownFolder.length}{folderTotal ? ` · ${weigh(folderTotal)}` : ''}
								{/if}
							</span>
							{#if folder.ready}
								<Icon name={folderShown ? 'chevron-up' : 'chevron-down'} size={16} />
							{/if}
						</button>
						{#if available && !folder.ready}
							<button class="open-folder" title="Open {folder.name} again, to read the images in it" onclick={reopen}>Open</button>
						{/if}
						{#if available}
							<button
								class="square save"
								title="Another folder — images are kept in {folder.name} now"
								aria-label="Choose another folder"
								onclick={choose}><Icon name="folder" size={12} /></button
							>
						{/if}
						<button
							class="square"
							title="Disconnect {folder.name}. Nothing in it is deleted; new images go into this browser"
							aria-label="Disconnect {folder.name}"
							onclick={forget}><Icon name="unplug" size={12} /></button
						>
					</li>
					{#if folder.ready && folderShown}
						{#each shownFolder as image (image.where + image.name)}
							{@render imageRow(image)}
						{/each}
					{/if}
				{/if}
				{#each shownHeld as image (image.where + image.name)}
					{@render imageRow(image)}
				{/each}
				{#each missing as name (name)}
					<li class="missing" title="{name} — pointed at, but not in this browser">
						<span class="thumb empty-thumb" aria-hidden="true"><Icon name="image" size={16} /></span>
						<span class="name">{name}</span>
						<span class="tag missing-tag">missing</span>
						<button class="find" title="Choose the file to use for {name}" onclick={() => findFor(name)}>
							<Icon name="image-reference" size={13} /> Find…
						</button>
					</li>
				{/each}
			</ul>
			{/if}
		{/if}
		{#if !busy && drawings.length}
			<!-- The pictures kept in the table itself, and on areas with no
			     column: not files, so nothing to delete or carry here — a press
			     opens one to draw on, in the side panel. -->
			{@render sectionHead('drawings', 'Drawings', `${drawings.length} · ${weigh(drawings.reduce((sum, d) => sum + d.src.length * 0.75, 0))}`)}
			{#if !collapsed.includes('drawings')}
			<ul class="images">
				{#each drawings as drawing (drawing.key)}
					<li>
						<button class="drawing as-typed" title="Open {drawing.label}, {drawing.where}, to draw on" onclick={() => onopendrawing?.(drawing.key)}>
							<span class="thumb pixels">
								<img
									src={drawing.src}
									alt=""
									draggable="false"
									onload={(e) => {
										const img = e.currentTarget as HTMLImageElement;
										drawnSizes = { ...drawnSizes, [drawing.key]: { w: img.naturalWidth, h: img.naturalHeight } };
									}}
								/>
							</span>
							<span class="name">{drawing.label} <span class="where-in">{drawing.where}</span></span>
							<span class="size">{[
								drawnSizes[drawing.key] ? `${drawnSizes[drawing.key].w} × ${drawnSizes[drawing.key].h} px` : '',
								weigh(drawing.src.length * 0.75)
							]
								.filter(Boolean)
								.join(' · ')}</span>
						</button>
						<button
							class="square save"
							title="Download {drawingFile(drawing)}"
							aria-label="Download {drawing.label}, {drawing.where}"
							onclick={() => downloadUrl(drawingFile(drawing), drawing.src)}
						>
							<Icon name="download" size={12} />
						</button>
					</li>
				{/each}
			</ul>
			{/if}
		{/if}
		{#if !busy && fonts.length}
			<!-- The faces the design is set in, and the files this browser holds.
			     A design carries a font's name, never its file, so a design moved
			     to another computer finds a local face missing: here it says so.
			     Any font can be given a file under its own name, or swapped for
			     another everywhere it is used. -->
			{@render sectionHead('fonts', 'Fonts', `${fonts.length}${fonts.some((f) => f.bytes) ? ` · ${weigh(fonts.reduce((sum, f) => sum + (f.bytes ?? 0), 0))}` : ''}`)}
			{#if !collapsed.includes('fonts')}
			<ul class="images fonts">
				{#each shownFonts as font (font.family)}
					<li
						class:missing={font.status === 'missing'}
						class:unused={font.status === 'unused'}
						class:replaced={font.family.toLowerCase() === outlinedFont}
					>
						<!-- The name set in the face it names: the quickest way to tell one
						     font from another, and to see that a missing one is falling
						     back — and no sample beside it to take the name's room. -->
						{#if font.used}
							<button
								class="name font-name"
								style="font-family:{fontStack(font.family, font.kind)}"
								aria-expanded={font.family.toLowerCase() === outlinedFont}
								title="{font.family}: what kind of face it is, for the one that stands in where it is missing"
								onclick={() => (outlinedFont = font.family.toLowerCase() === outlinedFont ? null : font.family.toLowerCase())}
							>{font.family}</button>
						{:else}
							<span class="name font-name" style="font-family:{fontStack(font.family, font.kind)}">{font.family}</span>
						{/if}
						<span class="size">{font.bytes ? weigh(font.bytes) : ''}</span>
						{#if FONT_STATUS[font.status]}
							<span class="tag" class:missing-tag={font.status === 'missing'}>{FONT_STATUS[font.status]}</span>
						{/if}
						<!-- What kind of face it is, for the fallback a card names after it
						     where the face is missing — on the outlined row, between the
						     name and Replace, as one more thing said about the face. Auto is
						     what its file says, or what the app knows of it; a file can say
						     nothing, or say it wrongly. -->
						{#if font.used && font.family.toLowerCase() === outlinedFont}
							<!-- A plain select, as the bars' are; Auto, which is no choice,
							     ruled off from the kinds. -->
							<select
								class="kind"
								aria-label="Type of {font.family}, for its fallback"
								title="What kind of face {font.family} is: where it is missing, a face of this kind stands in"
								value={font.fallback ?? ''}
								onchange={(e) => ontune?.(font.family, { fallback: (e.currentTarget.value || undefined) as FontKind | undefined })}
							>
								<option value="">Auto ({KIND_NAMES[font.detected ?? 'sans-serif']})</option>
								<hr />
								{#each FONT_KINDS as kind (kind)}
									<option value={kind}>{KIND_NAMES[kind]}</option>
								{/each}
							</select>
						{/if}
						{#if font.used}
							<span class="replace">
								<!-- Upload first: a file under this font's own name is the
								     replacement nearest to hand — a missing face supplied, a
								     Google one made local — then every other face to swap it
								     for, what this computer has before what must be fetched. -->
								<MenuSelect
									label="Replace {font.family} with"
									title="Upload a file for {font.family}, or set everything in it in another font instead"
									placeholder="Replace"
									value=""
									items={[
										font.status === 'system'
											? { value: UPLOAD, label: UPLOAD_LABEL, disabled: true, title: `${font.family} is a system font — it is on the computer already, so there is no file to upload` }
											: { value: UPLOAD, label: UPLOAD_LABEL, title: `A font file (TTF, OTF, WOFF or WOFF2) to use as ${font.family}, installed in this browser under this name` },
										{ rule: true },
										...familyItems(fontFamilies, font.family, ['local', 'system', 'google'], true)
									]}
									onopen={onfontsopen}
									onselect={(to) => (to === UPLOAD ? chooseFontFile(font.family) : to && void replaceFontKeepingPlace(font.family, to))}
								/>
							</span>
						{/if}
						<!-- A font nothing uses has no Replace, so its upload — a newer
						     cut under the same name — is a button of its own. -->
						{#if !font.used}
							<button
								class="square save"
								title="Upload a font file to use as {font.family} — installed in this browser under this name"
								aria-label="Upload a file for {font.family}"
								onclick={() => chooseFontFile(font.family)}
							>
								<Icon name="upload" size={12} />
							</button>
						{/if}
						{#if !font.used && font.status === 'unused'}
							<button
								class="square"
								title="Delete {font.family} from this browser — nothing in this design is set in it"
								aria-label="Delete {font.family}"
								onclick={() => (confirmingFont = font)}
							>
								<Icon name="trash" size={12} />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
			{/if}
			<input
				bind:this={fontInput}
				type="file"
				accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
				hidden
				onchange={fontChosen}
			/>
		{/if}
	</div>
	{/if}

	{#if focus && focusType && focusUrl}
		<!-- What can be done to it, in a row under it as the drawing editor has
		     its tools: turn it, mirror it, crop it to a frame drawn over it. -->
		<div class="tools" role="toolbar" aria-label="Image tools">
			<span class="segmented">
				<button title="Turn a quarter turn clockwise" aria-label="Rotate" onclick={turn}><Icon name="rotate" size={16} /></button>
				<button title="Flip left to right" aria-label="Flip horizontally" onclick={() => flip('x')}><Icon name="reflect-horizontal" size={16} /></button>
				<button title="Flip upside down" aria-label="Flip vertically" onclick={() => flip('y')}><Icon name="reflect-vertical" size={16} /></button>
				<button
					aria-pressed={cropping}
					title={cropping ? 'Stop cropping' : 'Crop — drag a frame over the image'}
					aria-label="Crop"
					onclick={() => {
						cropping = !cropping;
						frame = null;
					}}
				><Icon name="crop" size={16} /></button>
			</span>
			{#if cropping}
				<button class="apply" disabled={!isCrop(frame)} title="Keep only what is inside the frame" onclick={applyCrop}>Apply Crop</button>
			{/if}
		</div>
	{/if}

	{#if focus}
		<!-- Then, where the ways in usually are, the pager, and keeping the edit
		     or going back to what is stored. The pager steps through the
		     list in its own order, once nothing is waiting to be saved. -->
		<div class="actions">
			<span class="pager" role="group" aria-label="Image">
				<button class="step" title={dirty ? 'Save or revert the edit first' : 'Previous image'} aria-label="Previous image" disabled={dirty || focusIndex <= 0} onclick={() => step(-1)}><Icon name="chevron-left" size={16} /></button>
				<span class="count">{focusIndex + 1} / {shown.length}</span>
				<button class="step" title={dirty ? 'Save or revert the edit first' : 'Next image'} aria-label="Next image" disabled={dirty || focusIndex < 0 || focusIndex >= shown.length - 1} onclick={() => step(1)}><Icon name="chevron-right" size={16} /></button>
			</span>
			{#if focusType && focusUrl}
				<span class="spacer"></span>
				<button disabled={!dirty} title="Back to the image as it is stored" onclick={() => focusUrl && load(focusUrl)}>Revert</button>
			{:else if focusUrl}
				<span class="note">Shown only — this browser cannot write {focus.split('.').pop()?.toUpperCase() || 'this kind of'} files.</span>
				<span class="spacer"></span>
			{:else}
				<span class="spacer"></span>
			{/if}
			<!-- Delete and Save at the far end, as a drawing has them in the
			     table: the two things done to the picture itself. Delete asks
			     first, as it does from the list. -->
			<button class="danger" disabled={!focusRecord} title="Delete {focus}" onclick={() => focusRecord && (confirming = focusRecord)}>
				<Icon name="trash" size={15} /> Delete
			</button>
			{#if focusType && focusUrl}
				<button class="primary" disabled={!dirty || saving} title="Write the edit over {focus}" onclick={save}>Save</button>
			{/if}
		</div>
	{/if}
</section>

<input bind:this={fileInput} type="file" accept="image/*" multiple hidden onchange={upload} />
<input bind:this={replaceInput} type="file" accept="image/*" hidden onchange={putBack} />

{#if confirming}
	{@const image = confirming}
	<div class="confirm-backdrop" role="presentation" onclick={() => (confirming = null)}></div>
	<!-- Keys stop here: the page's own shortcuts listen on the window, and a
	     Delete or an arrow meant for this dialog would act on the card behind. -->
	<div
		class="confirm"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="delete-image-title"
		tabindex="-1"
		use:armDefault
		onkeydown={(e) => {
			e.stopPropagation();
			if (e.key === 'Escape') confirming = null;
		}}
	>
		<h2 id="delete-image-title">Delete “{image.name}”?</h2>
		<p>
			It is removed from {image.where === 'folder' ? 'the folder' : 'this browser'}, and this cannot be undone.
			{#if used.has(image.name)}
				Something on this card or in this table uses it, and will draw nothing until it is put back.
			{/if}
		</p>
		<div class="confirm-actions">
			<button onclick={() => (confirming = null)}>Cancel</button>
			<button
				class="danger-solid"
				data-default
				onclick={() => {
					// Taken before the dialog is closed: `image` reads `confirming`,
					// which closing it empties.
					const doomed = image;
					confirming = null;
					void remove(doomed);
				}}>Delete Image</button
			>
		</div>
	</div>
{/if}

{#if confirmingFont}
	{@const font = confirmingFont}
	<div class="confirm-backdrop" role="presentation" onclick={() => (confirmingFont = null)}></div>
	<div
		class="confirm"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="delete-font-title"
		tabindex="-1"
		use:armDefault
		onkeydown={(e) => {
			e.stopPropagation();
			if (e.key === 'Escape') confirmingFont = null;
		}}
	>
		<h2 id="delete-font-title">Delete “{font.family}”?</h2>
		<p>
			It is removed from this browser, and this cannot be undone. Nothing in this design is set in it, but
			another design in your library may be, and would find it missing until the file is chosen again.
		</p>
		<div class="confirm-actions">
			<button onclick={() => (confirmingFont = null)}>Cancel</button>
			<button
				class="danger-solid"
				data-default
				onclick={() => {
					const doomed = font;
					confirmingFont = null;
					ondeletefont?.(doomed);
				}}>Delete Font</button
			>
		</div>
	</div>
{/if}

{#if carry?.on && urls[carry.name]}
	<!-- What is being carried, under the finger — on a phone the finger is
	     over the very thing it is carrying, so it sits above and to the side. -->
	<img class="ghost" src={urls[carry.name]} alt="" style="left:{carry.x}px;top:{carry.y}px" />
{/if}

<style>
	/* The table's room: a column of head, list and foot, the list taking what
	   the other two leave and scrolling in it. */
	.images-tray {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: #fff;
		font: 0.75rem ui-sans-serif, system-ui, sans-serif;
		color: #111;
	}

	.tray-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-bottom: 1px solid #eee;
		background: #fafafa;
		min-height: 1.25rem;
	}

	.tray-head.grip {
		touch-action: none;
	}

	.context {
		font: 700 0.6875rem ui-sans-serif, system-ui, sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #555;
	}

	.find {
		margin-left: auto;
	}

	.find input {
		width: 9rem;
		font: inherit;
		padding: 3px 6px;
		border: 1px solid #d5d5d5;
		border-radius: var(--radius-input);
	}

	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 6px;
	}

	/* A placeholder, not content: a drag across the list should not light it up. */
	.empty {
		margin: 12px 6px;
		color: #767676;
		line-height: 1.5;
		user-select: none;
	}

	/* The table's toolbar, as the table draws it. */
	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px;
		border-top: 1px solid #eee;
	}

	.actions button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: 0.75rem ui-sans-serif, system-ui, sans-serif;
		padding: 5px 10px;
		border: 1px solid #ccc;
		border-radius: var(--radius-button);
		background: #fff;
		color: #111;
		cursor: pointer;
	}

	.actions button:hover {
		border-color: #999;
	}

	.actions button.primary {
		background: #111;
		border-color: #111;
		color: #fff;
	}

	/* Red in words, as every Delete in the app is. */
	.actions button.danger {
		color: #b42318;
		border-color: #e4a9a3;
	}

	.actions button.danger:hover:not(:disabled) {
		background: #fdecea;
	}

	.actions button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.actions .spacer {
		flex: 1;
	}

	.note {
		color: #767676;
	}

	/* The card's pager, as it is drawn under the sheet. */
	.actions .pager {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-right: 4px;
	}

	.actions .pager .step {
		border: none;
		background: none;
		padding: 2px;
		color: #555;
	}

	.actions .pager .count {
		min-width: 2.75rem;
		text-align: center;
		color: #555;
		font-variant-numeric: tabular-nums;
	}

	.tray-head .back {
		display: grid;
		place-items: center;
		width: 1.375rem;
		height: 1.375rem;
		padding: 0;
		border: none;
		background: none;
		color: #555;
		cursor: pointer;
	}

	.tray-head .back:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.focus-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-transform: none;
		letter-spacing: 0;
		color: #111;
	}

	/* The room the picture is fitted to, as the drawing surface's stage is:
	   never scrolls, the scale is worked out from its size. */
	.viewer {
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		overflow: hidden;
		padding: 12px;
		background: #f3f4f6;
		position: relative;
	}

	.viewer .large {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.viewer .board {
		position: relative;
		background: repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 12px 12px;
		box-shadow: 0 0 0 1px #c9cdd4;
		touch-action: none;
	}

	.viewer .board[hidden] {
		display: none;
	}

	.viewer .board.cropping {
		cursor: crosshair;
	}

	.viewer canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* Under the picture, centred, square buttons as the drawing editor's. */
	.tools {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 6px 8px;
		background: #f3f4f6;
	}

	.tools .segmented {
		display: flex;
		gap: 4px;
	}

	.tools button {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: 1.875rem;
		height: 1.875rem;
		padding: 0;
		font: 600 0.8125rem ui-sans-serif, system-ui, sans-serif;
		background: #fff;
		border: 1px solid #c9cdd4;
		border-radius: 6px;
		cursor: pointer;
	}

	.tools button[aria-pressed='true'] {
		background: var(--accent-tint);
		border-color: var(--accent);
		color: var(--accent-strong);
	}

	.tools button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.tools .apply {
		width: auto;
		padding: 0 10px;
	}

	/* What stays, lit; what goes, dimmed by the frame's own shadow. */
	.crop-frame {
		position: absolute;
		border: 1px dashed #fff;
		outline: 1px solid var(--accent);
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
		pointer-events: none;
	}

	.viewer .board.cropping {
		overflow: hidden;
	}

	.images {
		display: flex;
		flex-direction: column;
		gap: 2px;
		list-style: none;
		margin: 0;
		padding: 0;
		min-width: 0;
	}

	.images li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px;
		border: 1px solid transparent;
		border-radius: var(--radius-button);
	}

	.images li:hover {
		border-color: #ddd;
		background: #fff;
	}

	.images li.unused .name {
		color: #767676;
	}

	/* The folder's line reads as the head of what it holds: the name in the
	   list's own weight, its pictures stepped in under it while it is open. */
	.folder-toggle {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.folder-toggle:disabled {
		cursor: default;
	}

	.folder-line .name {
		font-weight: 600;
	}

	.folder-line.shut .name {
		color: #767676;
	}

	.folder-toggle :global(svg) {
		flex: none;
		color: #555;
	}

	.thumb.folder-thumb {
		background: #fafafa;
		color: #555;
		cursor: inherit;
	}

	.images li.in-folder {
		margin-left: 1.25rem;
	}

	/* The grip. `touch-action: none` because a carry is a drag, and the
	   browser would otherwise take the first few pixels of it as a scroll. */
	.thumb {
		flex: none;
		display: grid;
		place-items: center;
		width: 3rem;
		height: 2.25rem;
		border: 1px solid #ddd;
		border-radius: 2px;
		background:
			repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 8px 8px;
		overflow: hidden;
		cursor: grab;
		touch-action: none;
	}

	.thumb.carrying {
		opacity: 0.4;
	}

	.thumb img {
		max-width: 100%;
		max-height: 100%;
		pointer-events: none;
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.size,
	.total {
		color: #767676;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.tag {
		font: 600 0.5625rem/1 ui-sans-serif, system-ui, sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #b26a00;
	}

	/* A grid, so the icon is in the middle of what a finger presses: as a
	   block, the `justify-content` it had did nothing and the glyph sat at
	   the left of its square. */
	.images li :global(button.square),
	.section-actions :global(button.square) {
		flex: none;
		display: inline-grid;
		place-items: center;
		border: none;
		width: 1.375rem;
		height: 1.375rem;
		padding: 0;
		color: #767676;
		background: none;
	}

	.images li :global(button.square:hover),
	.section-actions :global(button.square:hover) {
		color: #b42318;
		background: #fdf3f2;
	}

	/* The download, beside Delete: as quiet, and not red on hover. */
	.images li :global(button.square.save:hover),
	.section-actions :global(button.square.save:hover) {
		color: var(--accent-strong);
		background: var(--accent-tint);
	}

	/* Off — a system font has no file to upload: faint, and no hover. */
	.images li :global(button.square:disabled),
	.section-actions :global(button.square:disabled),
	.images li :global(button.square:disabled:hover),
	.section-actions :global(button.square:disabled:hover) {
		color: #c4c4c4;
		background: none;
		cursor: default;
	}

	/* The drawings' heading, under the stored pictures. */
	/* The font a replace just put in, where the replaced one was: outlined
	   until the panel is opened again, as a reminder of what changed. */
	.fonts li.replaced {
		outline: 1px solid var(--accent);
		outline-offset: -1px;
		border-radius: 3px;
	}

	/* Its kind, between the name and Replace: the bars' own select — a line
	   under the value, the accent's when focused — as wide as its word. */
	.fonts select.kind {
		flex: none;
		max-width: 9.5rem;
		font: 0.75rem ui-sans-serif, system-ui, sans-serif;
		padding: 3px 2px;
		border: none;
		border-bottom: 1px solid var(--border-control);
		border-radius: 0;
		background: transparent;
		color: #111;
	}

	.fonts select.kind:hover {
		border-bottom-color: var(--border-control-hover);
	}

	.fonts select.kind:focus {
		outline: none;
		border-bottom-color: var(--accent);
		box-shadow: 0 1px 0 var(--accent);
	}

	/* A used font's name is the way to its Type: a button that looks like the name. */
	.images li button.font-name {
		border: none;
		background: none;
		padding: 0;
		height: auto;
		text-align: left;
		/* Not the panel's button type: the name, in its face, as it was. */
		text-transform: none;
		letter-spacing: normal;
		font-weight: 400;
		color: inherit;
		cursor: pointer;
	}

	/* A font's name in its own face, a size up so the face can be read. */
	.font-name {
		font-size: 0.9375rem;
		line-height: 1.6;
	}

	/* Wide enough for its word; the name before it gets the rest. */
	.fonts .replace {
		flex: none;
		display: inline-flex;
	}

	/* "Replace" as written, beside the Type select's "Auto (Serif)": two
	   menus on one line, set alike. On the trigger itself, since the
	   panel's buttons are set in capitals and a button inherits none. */
	.fonts .replace :global(.trigger) {
		text-transform: none;
		letter-spacing: normal;
	}

	.section {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 12px 4px 4px;
		font: 600 0.6875rem ui-sans-serif, system-ui, sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #555;
	}

	/* The whole head is the fold, a quiet button in the heading's own type. */
	.section-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: -4px;
		padding: 2px 4px;
		border: none;
		border-radius: var(--radius-button);
		background: none;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		color: inherit;
		cursor: pointer;
	}

	/* The images' ways in, at the far end of their head, as quiet as the
	   buttons on each line under it. */
	.section-actions {
		margin-left: auto;
		align-self: center;
		display: inline-flex;
		align-items: center;
		gap: 2px;
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
	}

	.open-folder {
		font: 0.75rem ui-sans-serif, system-ui, sans-serif;
		padding: 2px 8px;
		margin-right: 4px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-button);
		background: #fff;
		color: #111;
		cursor: pointer;
	}

	.section-toggle:hover {
		background: #f0f0f0;
	}

	.section-toggle .total {
		margin-left: 4px;
	}

	.section-toggle :global(svg) {
		margin-left: 2px;
		color: #555;
	}

	.section .total {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
	}

	/* A drawing's whole line is the button: there is nothing else on it. */
	.drawing {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.drawing .thumb {
		cursor: pointer;
	}

	/* Drawn at a few pixels a side, and shown as the pixels they are. */
	.thumb.pixels img {
		image-rendering: pixelated;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.where-in {
		color: #767676;
	}

	/* Pointed at, not held: a dashed frame where the thumbnail would be. */
	.empty-thumb {
		border-style: dashed;
		background: #fafafa;
		color: #b3b3b3;
		cursor: default;
	}

	.missing .name {
		color: #767676;
	}

	.missing-tag {
		color: #b42318;
	}

	.find {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font: 0.6875rem ui-sans-serif, system-ui, sans-serif;
		padding: 2px 8px;
		border: 1px solid #ccc;
		border-radius: var(--radius-button);
		background: #fff;
		cursor: pointer;
	}

	/* The app's confirm dialog, drawn here since this tray owns it. */
	.confirm-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(0, 0, 0, 0.35);
	}

	.confirm {
		position: fixed;
		z-index: 41;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		box-sizing: border-box;
		width: min(420px, calc(100vw - 32px));
		padding: 20px 22px;
		background: #fff;
		border-radius: 10px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
		font: 0.8125rem/1.5 ui-sans-serif, system-ui, sans-serif;
	}

	.confirm h2 {
		margin: 0 0 6px;
		font-size: 1rem;
		overflow-wrap: anywhere;
	}

	.confirm p {
		margin: 0 0 14px;
		color: #333;
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.confirm-actions button {
		font: 0.8125rem ui-sans-serif, system-ui, sans-serif;
		padding: 6px 12px;
		border: 1px solid #ccc;
		border-radius: var(--radius-button);
		background: #fff;
		cursor: pointer;
	}

	.confirm-actions .danger-solid {
		background: #b42318;
		border-color: #b42318;
		color: #fff;
	}

	.ghost {
		position: fixed;
		z-index: 60;
		width: 3.5rem;
		height: 3.5rem;
		object-fit: contain;
		margin: -64px 0 0 8px;
		pointer-events: none;
		border: 1px solid var(--accent);
		border-radius: 3px;
		background: #fff;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
		opacity: 0.9;
	}
</style>
