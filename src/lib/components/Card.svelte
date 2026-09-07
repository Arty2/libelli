<script lang="ts">
	import Icon from './Icon.svelte';
	import { backgroundStyle } from '$lib/assets';
	import { scopeCss, styleTag } from '$lib/css';
	import { fontStack } from '$lib/fonts';
	import { FREE_STEP, GRID_MINOR, boxEdges, pxToMm, resolveLayout, snapTo, snapToEdges } from '$lib/layout';
	import { renderMarkdown } from '$lib/markdown';
	import { normaliseRotation, sidesOf } from '$lib/template';
	import { qrSvg } from '$lib/qr';
	import type { Box, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row?: Row | null;
		mapping?: Mapping;
		/** dashed box bounds and the bleed marker; screen only, never printed */
		bounds?: boolean;
		/** families still arriving, so an area can say so rather than sit in the fallback */
		loadingFonts?: string[];
		/** snap drags to the 5mm subgrid rather than to sibling edges */
		grid?: boolean;
		/** preview scale, used only to convert pointer deltas back to mm */
		scale?: number;
		interactive?: boolean;
		selectedIds?: string[];
		/** 1-based position of this card in the run; drawn when the template asks for it */
		pageNumber?: number | null;
		/**
		 * The template's background image, already resolved to something a
		 * `background-image` can use. Resolved by the app rather than here,
		 * because reading it back out of storage is asynchronous and this
		 * component has to stay a pure function of its props.
		 */
		background?: string | null;
		/** `additive` is a modifier-click: add to or drop from the selection */
		onselect?: (id: string | null, additive?: boolean) => void;
		onchange?: (box: Box) => void;
		/** right-click on a box, in viewport coordinates */
		onmenu?: (id: string, x: number, y: number) => void;
		/** what a drag is about to do, so undo can name it afterwards */
		onaction?: (what: string) => void;
	}

	let {
		template,
		row = null,
		mapping = {},
		bounds = false,
		loadingFonts = [],
		grid = false,
		scale = 1,
		interactive = false,
		selectedIds = [],
		pageNumber = null,
		background = null,
		onselect,
		onchange,
		onmenu,
		onaction
	}: Props = $props();

	let measured = $state<Record<string, number>>({});
	/** boxes whose content is taller than the box will let it be */
	let overflowing = $state<Record<string, boolean>>({});
	/** the edge a live drag has latched onto, drawn as a guide until it lets go */
	let guide = $state<{ x: number | null; y: number | null }>({ x: null, y: null });

	const contentOf = (box: Box): string => {
		if (box.slot) {
			const column = mapping[box.slot];
			const value = column ? row?.[column] : undefined;
			return value == null ? '' : String(value);
		}
		return box.static?.text ?? '';
	};

	const isEmpty = (box: Box) => {
		if (box.mode === 'image') return !(box.static?.svg || box.static?.url || box.static?.dataUrl || contentOf(box).trim());
		return contentOf(box).trim() === '';
	};

	/**
	 * A QR is only worth printing if it scans, so anything the encoder refuses —
	 * empty text, or more than a version-10 code can hold — renders as nothing
	 * rather than as a square that no phone will read.
	 */
	function qrFor(box: Box): string {
		const value = contentOf(box).trim() || box.static?.text?.trim() || '';
		if (!value) return '';
		try {
			return fitSvg(
				qrSvg(value, {
					level: box.qr?.level ?? 'M',
					margin: box.qr?.margin ?? 2,
					colour: box.color ?? template.defaults.color,
					background: box.qr?.background
				}),
				box.fit
			);
		} catch {
			return '';
		}
	}

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

	const hidden = $derived(new Set(template.boxes.filter((b) => b.hideWhenEmpty && isEmpty(b)).map((b) => b.id)));
	const layout = $derived(resolveLayout({ boxes: template.boxes, measured, hidden }));

	const bleed = $derived(template.bleed.enabled ? template.bleed.amount : 0);
	const customCss = $derived(scopeCss(template.css ?? '', '.trim'));

	const VALIGN_TO_FLEX = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

	/**
	 * Paper colour is the ground and the image sits on it, both covering the
	 * bleed as well as the trim — a background that stopped at the trim edge
	 * would show a white rim on everything printed with bleed.
	 */
	function cardStyle(): string {
		return [
			`width:${template.page.w + bleed * 2}mm`,
			`height:${template.page.h + bleed * 2}mm`,
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
			const content = node.querySelector<HTMLElement>('.content');
			const spills = !!content && content.scrollHeight > node.clientHeight + 1;
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

	function boxStyle(box: Box): string {
		const parts = [
			`left:${box.x}mm`,
			`top:${layout.tops[box.id] ?? box.y}mm`,
			`width:${box.w}mm`,
			`font-family:${fontStack(box.font ?? template.defaults.font, template.defaults.font)}`,
			`font-size:${box.size ?? template.defaults.size}pt`,
			`font-weight:${box.weight ?? template.defaults.weight}`,
			`line-height:${box.lineHeight ?? template.defaults.lineHeight}`,
			`color:${box.color ?? template.defaults.color}`,
			`text-align:${box.align ?? template.defaults.align}`,
			// Vertical placement needs the box to be a flex column. That stops the
			// first child's top margin collapsing out of the box, which the
			// `:first-child { margin-top: 0 }` rules below already neutralise; the
			// box's own offsetHeight is unchanged, so anchoring still measures right.
			`justify-content:${VALIGN_TO_FLEX[box.valign ?? 'top']}`
		];
		// Justified text without hyphenation opens rivers; the card is `lang="en"`
		// so the browser has a dictionary to break with.
		if ((box.align ?? template.defaults.align) === 'justify') parts.push('hyphens:auto');
		const letterSpacing = box.letterSpacing ?? template.defaults.letterSpacing;
		if (letterSpacing) parts.push(`letter-spacing:${letterSpacing}mm`);
		if (box.italic) parts.push('font-style:italic');
		if (box.textCase === 'uppercase') parts.push('text-transform:uppercase');
		if (box.textCase === 'smallcaps') parts.push('font-variant-caps:small-caps');
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
		if (box.background) parts.push(`background:${box.background}`);
		// `.box` is border-box, so a border eats into the width rather than adding
		// to it: the box still occupies exactly the millimetres it was given.
		if (box.borderWidth) {
			const { top, right, bottom, left } = sidesOf(box.borderWidth);
			parts.push(
				`border-width:${top}mm ${right}mm ${bottom}mm ${left}mm`,
				`border-style:${box.borderStyle ?? 'solid'}`,
				`border-color:${box.borderColor ?? box.color ?? template.defaults.color}`
			);
		}
		if (box.borderRadius) parts.push(`border-radius:${box.borderRadius}mm`);
		// A CSS transform does not touch layout, so a rotated box still reports the
		// height it would have had upright — which is what `measure()` reads and
		// what anchored boxes below follow. That is the intended bargain: turning a
		// box does not shove the rest of the card around. Snapping sees the upright
		// rectangle too.
		if (box.rotation) {
			const centre = box.centre ?? { x: 50, y: 50 };
			parts.push(`transform:rotate(${box.rotation}deg)`, `transform-origin:${centre.x}% ${centre.y}%`);
		}
		if (hidden.has(box.id)) {
			parts.push('height:0', 'overflow:hidden', 'visibility:hidden');
		} else if (box.overflow === 'clip') {
			// The height only. The clip itself is CSS, on .content — put here, on
			// the box, it also ate the handles and badges that hang off its edges.
			parts.push(`height:${box.h}mm`);
		} else {
			parts.push(`min-height:${box.h}mm`);
		}
		return parts.join(';');
	}

	/** The page number rides on the template's own defaults, never on a box's. */
	function pageNumberStyle(): string {
		const { position, margin } = template.pageNumber;
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

	const imageSource = (box: Box) =>
		box.static?.dataUrl ?? box.static?.url ?? (box.slot ? contentOf(box) : '');

	/** Inline SVG is a template author's own markup, but never let it carry script. */
	const safeSvg = (svg: string) =>
		svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

	// ---- direct manipulation -------------------------------------------------

	type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'centre' | 'rotate';
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
	const isSelected = (box: Box) => selectedIds.includes(box.id);
	/** Handles belong to a single box: with several chosen, the bar does the work. */
	const soleSelection = $derived(selectedIds.length === 1);

	function startDrag(event: PointerEvent, box: Box, mode: DragMode) {
		// Only the primary button drags. Without this a right-click starts one,
		// and its non-additive select collapses a multi-selection to one box
		// before the context menu it opened has a chance to act on the rest.
		if (event.button !== 0 || !interactive) return;
		event.preventDefault();
		event.stopPropagation();
		// Selecting comes first and is never refused: a lock stops a box moving,
		// not being picked — otherwise the only control that could unlock it
		// could never be reached.
		onselect?.(box.id, event.shiftKey || event.metaKey || event.ctrlKey);
		if (!editable(box)) return;
		drag = {
			id: box.id,
			mode,
			startX: event.clientX,
			startY: event.clientY,
			origin: { ...box },
			// Snapshotted at the start: moving several boxes applies one delta to
			// each of these, so a box cannot drift by accumulating rounding.
			others:
				mode === 'move' && selectedIds.length > 1
					? template.boxes.filter((b) => b.id !== box.id && selectedIds.includes(b.id) && !b.locked).map((b) => ({ ...b }))
					: [],
			// Anchored boxes already follow this one downwards — resolveLayout takes
			// their top from its bottom — so they only need the sideways half of the
			// move. Applying the vertical delta as well would move them twice.
			held:
				mode === 'move'
					? dependentsOf(box.id)
							.filter((b) => !b.locked && !selectedIds.includes(b.id))
							.map((b) => ({ ...b }))
					: []
		};
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	/**
	 * Snapping, strongest first: an enabled grid wins over everything else, and
	 * otherwise a box latches onto a sibling's edge when it comes within
	 * `SNAP_TOLERANCE`. Sibling edges come from the resolved layout, so a box
	 * snaps to where a grown box really ends.
	 *
	 * There is no modifier to hold: the two toggles under the page are the whole
	 * control. Grid off and Bounds off is free movement, because a box cannot
	 * latch onto a guide that is not being drawn — a snap to an invisible edge is
	 * indistinguishable from a bug.
	 */
	const SNAP_TOLERANCE = 1.5;

	function moveDrag(event: PointerEvent) {
		if (!drag) return;
		const latch = !grid && bounds;
		const edges = latch ? boxEdges(template.boxes, layout, drag.id) : { x: [], y: [] };
		const latched = { x: null as number | null, y: null as number | null };

		const place = (value: number, axis: 'x' | 'y'): number => {
			if (grid) return snapTo(value, GRID_MINOR);
			const hit = latch ? snapToEdges(value, edges[axis], SNAP_TOLERANCE) : null;
			if (hit === null) return snapTo(value, FREE_STEP);
			latched[axis] = hit;
			return hit;
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
		}

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
		const turn = drag.mode === 'move' || drag.mode === 'rotate' ? 0 : ((origin.rotation ?? 0) * Math.PI) / 180;
		const cos = Math.cos(turn);
		const sin = Math.sin(turn);
		const dx = screenX * cos + screenY * sin;
		const dy = -screenX * sin + screenY * cos;
		const next: Box = { ...origin };

		const setTop = (deltaY: number) => {
			// An anchored box has no independent top: move its gap instead, so the
			// relationship the template author set up survives being dragged.
			if (origin.anchor) next.anchor = { ...origin.anchor, gap: Math.max(0, size(origin.anchor.gap + deltaY)) };
			else next.y = place(origin.y + deltaY, 'y');
		};

		switch (drag.mode) {
			case 'rotate': {
				// The angle from the pivot to the pointer, against the angle it
				// started at, so the box does not jump when the drag begins. Both
				// are measured in the page's own space: the handle turns with the
				// box, so a delta would chase itself.
				const node = event.currentTarget as HTMLElement;
				const boxEl = node.closest('.box') as HTMLElement | null;
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
				const c = origin.centre ?? { x: 50, y: 50 };
				const pivotX = trim.left + (boxEl.offsetLeft + (boxEl.offsetWidth * c.x) / 100) * scale;
				const pivotY = trim.top + (boxEl.offsetTop + (boxEl.offsetHeight * c.y) / 100) * scale;
				// The lever is grabbed at arm's length from the pivot, so the angle is
				// well defined the moment the drag starts — which is the whole reason
				// rotation is not dragged from the pivot itself, where atan2 has
				// nothing to measure and a pixel of movement swings the box wildly.
				const now = Math.atan2(event.clientY - pivotY, event.clientX - pivotX);
				const then = Math.atan2(drag.startY - pivotY, drag.startX - pivotX);
				let deg = (origin.rotation ?? 0) + ((now - then) * 180) / Math.PI;
				// Whole degrees, or a quarter turn with Shift — the same bargain the
				// grid makes for position: coarse by default, exact when typed.
				deg = event.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg);
				next.rotation = normaliseRotation(deg) ?? 0;
				break;
			}
			case 'centre': {
				// Percent of the box, not millimetres, because that is how the pivot
				// is stored — and clamped to the box, so it can never be dragged
				// somewhere the marker cannot be picked up again.
				const was = origin.centre ?? { x: 50, y: 50 };
				const pct = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
				next.centre = {
					x: pct(was.x + (dx / origin.w) * 100),
					y: pct(was.y + (dy / Math.max(1, layout.heights[origin.id] ?? origin.h)) * 100)
				};
				break;
			}
			case 'move':
				next.x = place(origin.x + dx, 'x');
				setTop(dy);
				break;
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
		guide = latched;
		onchange?.(next);

		// Whatever snapping did to the box under the pointer is what the others
		// move by, so the selection keeps its shape.
		if (drag.mode === 'move' && drag.others.length) {
			const movedX = next.x - origin.x;
			const movedY = origin.anchor
				? (next.anchor?.gap ?? 0) - origin.anchor.gap
				: next.y - origin.y;
			for (const other of drag.others) {
				const moved: Box = { ...other, x: round2(other.x + movedX) };
				if (movedY) {
					if (other.anchor) moved.anchor = { ...other.anchor, gap: Math.max(0, round2(other.anchor.gap + movedY)) };
					else moved.y = round2(other.y + movedY);
				}
				onchange?.(moved);
			}
		}

		if (drag.mode === 'move' && drag.held.length) {
			const movedX = next.x - origin.x;
			if (movedX) for (const held of drag.held) onchange?.({ ...held, x: round2(held.x + movedX) });
		}
	}

	const round2 = (v: number) => Math.round(v * 100) / 100;

	function endDrag(event: PointerEvent) {
		if (!drag) return;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		} catch {
			/* pointer already released */
		}
		drag = null;
		guide = { x: null, y: null };
	}

	const HANDLES: DragMode[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

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

	const waitingFor = (box: Box) =>
		loadingFonts.includes(box.font ?? template.defaults.font);
</script>

<div class="card" class:bleeding={bleed > 0} class:editing={interactive} style={cardStyle()} lang="en">
	<div class="trim" style="width:{template.page.w}mm;height:{template.page.h}mm">
		{#if customCss}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- scopeCss confines it to .trim and strips @import, remote url() and any closing style tag -->
			{@html styleTag(customCss)}
		{/if}

		{#if bounds && bleed > 0}
			<!-- Where the paper will be cut. -->
			<svg class="chrome trim-line" aria-hidden="true"><rect width="100%" height="100%" /></svg>
		{/if}

		{#each template.boxes as box (box.id)}
			{@const empty = hidden.has(box.id)}
			<div
				class="box"
				class:outlined={bounds && !empty}
				class:selected={interactive && isSelected(box)}
				class:interactive={editable(box)}
				class:clipped={box.overflow === 'clip' && !empty}
				class:locked={!!box.locked}
				class:no-padding={!box.padding}
				class:grouped={!!box.group}
				class:font-loading={interactive && waitingFor(box)}
				style={boxStyle(box)}
				data-box-id={box.id}
				use:measure={box.id}
				onpointerdown={(e) => startDrag(e, box, 'move')}
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
				role="presentation"
			>
				<div class="content">
					{#if box.mode === 'markdown'}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes every leaf -->
						{@html renderMarkdown(contentOf(box), { size: box.size ?? template.defaults.size, md: box.md })}
					{:else if box.mode === 'qr'}
						<span class="media" style="height:{box.h}mm">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated here, not user markup -->
							{@html qrFor(box)}
						</span>
					{:else if box.mode === 'image'}
						<span class="media" style="height:{box.h}mm">
							{#if box.static?.svg}
								{@html fitSvg(safeSvg(box.static.svg), box.fit)}
							{:else if imageSource(box)}
								<img src={imageSource(box)} alt="" style="object-fit:{box.fit ?? 'contain'}" />
							{/if}
						</span>
					{:else}
						<span class="plain">{contentOf(box)}</span>
					{/if}
				</div>

				<!-- The lines around a box are strokes, not borders. A browser rounds
				     border-width to whole device pixels, so a bound asked for at
				     1.33px inside a 75% card was drawn at 1px and one asked for at
				     0.5px inside a 200% card was drawn at 2px. An SVG stroke is not
				     rounded, so var(--line) lands exactly whatever the zoom. -->
				{#if bounds && !empty}
					<svg class="chrome bounds" aria-hidden="true"><rect width="100%" height="100%" /></svg>
				{/if}
				{#if interactive && isSelected(box)}
					{#if box.padding}
						<!-- Where the words actually start. -->
						<svg class="chrome pad" aria-hidden="true"><rect width="100%" height="100%" /></svg>
					{/if}
					<svg class="chrome selection" aria-hidden="true"><rect width="100%" height="100%" /></svg>
				{/if}

				{#if bounds && !empty && overflowing[box.id]}
					<!-- A badge like the others, in the one colour that means the print
					     will be wrong rather than merely constrained. Shears, because
					     what is happening to the words is that they are being cut. -->
					<span class="overflow-mark" title="The content does not fit — this area is cutting off what will print">
						<Icon name="scissors" size={11} />
					</span>
				{/if}

				{#if bounds && (box.anchor || box.locked || isStatic(box) || anchorTargets.has(box.id))}
					<!-- Why the box will not do what you might ask of it, stacked at its
					     corner: the anchor above the lock when it carries both. -->
					<span class="badges">
						{#if isStatic(box)}
							<span class="badge" title="Static text — this says the same on every card, because it is not bound to a column">
								<Icon name="unlink" size={11} />
							</span>
						{/if}
						{#if box.anchor}
							<span class="badge" title="Tied to another area — its top follows that area's bottom, and it moves when that one does">
								<Icon name="knot" size={11} />
							</span>
						{/if}
						{#if anchorTargets.has(box.id)}
							<span class="badge" title="Other areas are anchored to this one — moving it moves them too">
								<Icon name="anchor" size={11} />
							</span>
						{/if}
						{#if box.locked}
							<span class="badge" title="Locked">
								<Icon name="locked" size={11} />
							</span>
						{/if}
					</span>
				{/if}

				{#if interactive && isSelected(box) && soleSelection}
					{#if editable(box)}
						<!-- Turning happens about the pivot, so the handle for it is the
						     pivot: a mark on the top edge would say nothing about where
						     the box is actually going to turn, and the pivot moves. One
						     mark, two gestures — drag to turn, Alt-drag to move the
						     point turned about — with the X and Y in the bar as the
						     precise way to place it for anyone who never finds the
						     modifier. Drawn on an upright box too, unlike the old pivot,
						     because it is the rotation control now and has to be there
						     before there is any rotation to show. -->
						<span
							class="pivot"
							style="left:{(box.centre ?? { x: 50, y: 50 }).x}%;top:{(box.centre ?? { x: 50, y: 50 }).y}%"
							title="The point this area turns about — drag it, or type it in the bar"
							onpointerdown={(e) => startDrag(e, box, 'centre')}
							onpointermove={moveDrag}
							onpointerup={endDrag}
							onpointercancel={endDrag}
							role="presentation"
						></span>
						<span
							class="lever"
							style="left:{(box.centre ?? { x: 50, y: 50 }).x}%;top:{(box.centre ?? { x: 50, y: 50 }).y}%"
							title="Drag to turn this area — hold Shift for 15° steps"
							onpointerdown={(e) => startDrag(e, box, 'rotate')}
							onpointermove={moveDrag}
							onpointerup={endDrag}
							onpointercancel={endDrag}
							role="presentation"
						></span>
						{#each HANDLES as handle (handle)}
							<span
								class="handle h-{handle}"
								onpointerdown={(e) => startDrag(e, box, handle)}
								onpointermove={moveDrag}
								onpointerup={endDrag}
								onpointercancel={endDrag}
								role="presentation"
							></span>
						{/each}
					{/if}
				{/if}
			</div>
		{/each}

		{#if template.pageNumber.enabled && pageNumber != null}
			<div class="page-number" style={pageNumberStyle()}>{pageNumber}</div>
		{/if}

		{#if guide.x !== null}
			<span class="guide vertical" style="left:{guide.x}mm"></span>
		{/if}
		{#if guide.y !== null}
			<span class="guide horizontal" style="top:{guide.y}mm"></span>
		{/if}
	</div>

	{#if bleed > 0 && template.bleed.cropMarks}
		<div class="crop-marks" aria-hidden="true">
			{#each ['tl', 'tr', 'bl', 'br'] as corner (corner)}
				<span class="mark {corner}" style="--bleed:{bleed}mm"></span>
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
		/* Paper colour is part of the artwork, not decoration the printer may
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

	.box {
		position: absolute;
		box-sizing: border-box;
		overflow-wrap: break-word;
		display: flex;
		flex-direction: column;
	}

	/* The one flex item in the box, so `justify-content` still places the content
	   vertically, and so the content can be measured without the handles and
	   badges that hang off the box's edges. */
	.content {
		width: 100%;
		min-width: 0;
	}

	/* A clipped box cuts its content at its own edge, but must not cut the
	   handles, pivot and badges that sit outside that edge — they are siblings of
	   .content, so clipping here reaches the content and nothing else. The card
	   settles the same argument one level up, in .card.editing.

	   min-height: 0 is load-bearing: a flex item refuses by default to shrink
	   below its content height, so without it the content would keep spilling out
	   of the fixed-height box and there would be nothing for overflow to cut. */
	.box.clipped > .content {
		overflow: hidden;
		min-height: 0;
	}

	.plain {
		display: block;
		white-space: pre-wrap;
	}

	.page-number {
		position: absolute;
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

	.box.interactive {
		cursor: move;
		touch-action: none;
	}

	/* `--mark` is what you see, `--reach` is how far past it the pointer counts.
	   Both are in screen pixels: multiplying by `--ui-scale` undoes the card's
	   own zoom, so a handle is the same size to the hand at 40% as at 200%. */
	.handle,
	.pivot,
	.lever {
		--mark: calc(14px * var(--ui-scale, 1));
		--reach: calc(8px * var(--ui-scale, 1));
		position: absolute;
		width: var(--mark);
		height: var(--mark);
		/* No fill: a handle sits on top of the content it is there to resize, and a
		   white square hides the very edge you are trying to place. The trade-off
		   is that the outline is all there is to see, so it carries the weight on
		   a dark background image where a white square used to stand out. */
		background: transparent;
		border: calc(1px * var(--ui-scale, 1)) solid #2563eb;
		border-radius: var(--radius-button);
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
		/* The ring sits inside the arms, so the cross reads through it. */
		--ring: calc(4.5px * var(--ui-scale, 1));
		margin: calc(var(--mark) / -2) 0 0 calc(var(--mark) / -2);
		border: none;
		border-radius: 0;
		box-shadow: none;
		/* Two crossed bars, as background gradients. A gradient honours a
		   sub-pixel width where a border is rounded to whole device pixels, so the
		   arms come out the same weight as every other line on the card at any
		   zoom, straight off --line — and it costs no element, which matters
		   because ::before is the hit target. */
		background-image:
			linear-gradient(#2563eb, #2563eb),
			linear-gradient(#2563eb, #2563eb),
			radial-gradient(
				circle at center,
				transparent calc(var(--ring) - var(--line)),
				#2563eb calc(var(--ring) - var(--line)) var(--ring),
				transparent var(--ring)
			);
		background-size:
			100% var(--line),
			var(--line) 100%,
			100% 100%;
		background-position: center;
		background-repeat: no-repeat;
		cursor: move;
	}

	/* The lever: a knob on a short arm off the pivot, which is what you swing to
	   turn the box. It hangs off the pivot rather than off the box edge so it
	   travels with the point the rotation is actually about, and being at arm's
	   length is what gives the drag an angle to measure from the first pixel.
	   Below the pivot rather than above it, where the box's own content and the
	   area above it are not competing for the same few pixels. Both it and the
	   arm rotate with the box, because they are inside it. */
	.lever {
		--arm: calc(30px * var(--ui-scale, 1));
		--mark: calc(11px * var(--ui-scale, 1));
		margin: calc(var(--arm) - var(--mark) / 2) 0 0 calc(var(--mark) / -2);
		border-radius: 50%;
		cursor: grab;
	}

	.lever:active {
		cursor: grabbing;
	}

	/* The arm is drawn, not grabbed. It runs from the knob down to the pivot, so
	   leaving it hit-testable put a lever-shaped hole over the pivot and the point
	   the box turns about could never be picked up. */
	.lever::after {
		content: '';
		position: absolute;
		left: calc(50% - var(--line, 1px) / 2);
		bottom: 100%;
		width: var(--line, 1px);
		height: var(--arm);
		background: #2563eb;
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

	/* Fingers are not mice: the marks stay small enough to see past, and the
	   targets grow to something you can actually land on. */
	@media (pointer: coarse) {
		/* The mark shrinks and the reach grows by the same amount, so the target
		   stays 48px for a handle and 44px for the pivot — what it was when the
		   marks were 20px and 16px. A finger covers the thing it is dragging, so
		   the less of it the mark takes up the better, and the target is the
		   ::before, which costs no layout and does not have to be seen. */
		.handle {
			--mark: calc(10px * var(--ui-scale, 1));
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

	.h-nw { top: calc(var(--mark) / -2); left: calc(var(--mark) / -2); cursor: nwse-resize; }
	.h-n { top: calc(var(--mark) / -2); left: calc(50% - var(--mark) / 2); cursor: ns-resize; }
	.h-ne { top: calc(var(--mark) / -2); right: calc(var(--mark) / -2); cursor: nesw-resize; }
	.h-e { top: calc(50% - var(--mark) / 2); right: calc(var(--mark) / -2); cursor: ew-resize; }
	.h-se { bottom: calc(var(--mark) / -2); right: calc(var(--mark) / -2); cursor: nwse-resize; }
	.h-s { bottom: calc(var(--mark) / -2); left: calc(50% - var(--mark) / 2); cursor: ns-resize; }
	.h-sw { bottom: calc(var(--mark) / -2); left: calc(var(--mark) / -2); cursor: nesw-resize; }
	.h-w { top: calc(50% - var(--mark) / 2); left: calc(var(--mark) / -2); cursor: ew-resize; }

	.crop-marks .mark {
		position: absolute;
		width: var(--bleed);
		height: var(--bleed);
	}
	.crop-marks .tl { top: 0; left: 0; border-right: 0.2mm solid #000; border-bottom: 0.2mm solid #000; }
	.crop-marks .tr { top: 0; right: 0; border-left: 0.2mm solid #000; border-bottom: 0.2mm solid #000; }
	.crop-marks .bl { bottom: 0; left: 0; border-right: 0.2mm solid #000; border-top: 0.2mm solid #000; }
	.crop-marks .br { bottom: 0; right: 0; border-left: 0.2mm solid #000; border-top: 0.2mm solid #000; }

	@media screen {
		/* A family that has not arrived draws in the system stack, which looks
		   exactly like a font that never applied. The pulse says "wait" rather
		   than letting a slow font read as a broken one. Screen only, and off
		   entirely for anyone who has asked for less motion. */
		@media (prefers-reduced-motion: no-preference) {
			.box.font-loading .content {
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
		   state colour while selected, instead of the blue overwriting it.

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

		.chrome rect {
			fill: none;
			stroke-width: var(--line);
		}

		.bounds rect {
			stroke: var(--bounds-colour, rgba(37, 99, 235, 0.45));
			stroke-dasharray: calc(var(--line) * 3) calc(var(--line) * 3);
		}

		/* A locked box cannot be moved, and a grouped one moves with others: both
		   are reasons a drag will not do what you expect, so they colour the
		   bounds. Locked wins when a box is both — it is the stronger refusal.
		   The dash is coarser as well as red, because the overflow corner is
		   already red and two reds a millimetre apart are one red. */
		.box.grouped {
			--bounds-colour: rgba(124, 58, 237, 0.75);
		}

		.box.locked {
			--bounds-colour: rgba(180, 35, 24, 0.8);
		}

		.box.locked .bounds rect {
			stroke-width: var(--line-thick);
			stroke-dasharray: calc(var(--line) * 5) calc(var(--line) * 3);
		}

		.selection rect {
			stroke: #2563eb;
		}

		/* Positioned by the padding the box was given, so the guide moves with it
		   without anything having to convert millimetres to pixels. */
		.pad {
			inset: var(--pad-t, 0) var(--pad-r, 0) var(--pad-b, 0) var(--pad-l, 0);
			width: auto;
			height: auto;
		}

		.pad rect {
			stroke: rgba(8, 145, 178, 0.8);
			stroke-dasharray: calc(var(--line) * 2) calc(var(--line) * 2);
		}

		/* Green: it is not a box outline and not a state, it is the edge of the
		   paper, and purple now means a grouped box. */
		.trim-line rect {
			stroke: rgba(5, 150, 105, 0.85);
			stroke-dasharray: calc(var(--line) * 3) calc(var(--line) * 3);
		}

		/* The same badge as the others — same size, radius and standing clear of
		   the edge — in the one colour that says the print will be wrong. It hangs
		   off the bottom right, where the words run out, rather than sharing the
		   column of reasons at the top right. */
		.overflow-mark {
			position: absolute;
			top: 100%;
			left: 100%;
			margin: calc(-13px * var(--ui-scale, 1)) 0 0 calc(4px * var(--ui-scale, 1));
			display: grid;
			place-items: center;
			width: calc(13px * var(--ui-scale, 1));
			height: calc(13px * var(--ui-scale, 1));
			box-sizing: border-box;
			border-radius: var(--radius-button);
			border: var(--line) solid #8f1c13;
			background: #b42318;
			color: #fff;
			/* Hoverable, like the badges: its title is the only thing that says what
			   the mark means, and pointer-events: none meant it never showed. */
			pointer-events: auto;
			cursor: help;
			z-index: 3;
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
			z-index: 3;
			/* The column is click-through so a drag started beside the box still
			   reaches it; the badges themselves are not, or their title — the only
			   thing that says what they mean — could never be hovered. */
			pointer-events: none;
		}

		/* Quieter than the blue chrome around it. A badge is an annotation, not a
		   control: it says why the box will not do what you asked, and it should
		   not read as loudly as the thing you are dragging. */
		.badge {
			display: grid;
			place-items: center;
			width: calc(13px * var(--ui-scale, 1));
			height: calc(13px * var(--ui-scale, 1));
			/* Or the border is added to the width, and a badge drawn against the
			   zoom would hold its size everywhere except its own edges. */
			box-sizing: border-box;
			border-radius: var(--radius-button);
			background: #fff;
			border: var(--line) solid #c4c4c4;
			color: #767676;
			pointer-events: auto;
			cursor: help;
		}

		.badge:hover {
			border-color: #767676;
			color: #333;
		}

		/* Icon takes a px size, which is inside the card's transform like
		   everything else here, so the glyph is overridden against the zoom too —
		   otherwise the badge would hold its size and its contents would not. */
		.badge :global(svg),
		.overflow-mark :global(svg) {
			width: calc(9px * var(--ui-scale, 1));
			height: calc(9px * var(--ui-scale, 1));
		}

		.guide {
			position: absolute;
			background: #ec4899;
			pointer-events: none;
			z-index: 4;
		}

		.guide.vertical { top: 0; bottom: 0; width: var(--line); }
		.guide.horizontal { left: 0; right: 0; height: var(--line); }
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
