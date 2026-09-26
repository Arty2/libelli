<script lang="ts">
	import { HOLD_MS, vibrate } from '$lib/haptics';
	import { TIP_DELAY, TIP_HOLD, TIP_SLOP, tipPlacement } from '$lib/tooltip';

	/**
	 * The app's one tooltip, for every `title` in it.
	 *
	 * Mounted once and listening on the document, so a control only has to say
	 * `title="…"` — the hundreds already written need nothing more. While the
	 * pointer is on an element its title is moved aside into `data-tip`, which
	 * is what keeps the browser's own tooltip from appearing under this one,
	 * and put back when the pointer leaves, so the attribute is there for
	 * everything else that reads it.
	 *
	 * A mouse rests for a moment; a finger presses and holds, which is the only
	 * way a hint written into a title was ever going to reach a phone. Hold on a
	 * control and its tip appears above your finger; let go and the press does
	 * nothing — you were asking, not pressing. Text fields are left out of the
	 * hold: there a long press is how a phone pastes.
	 */

	let text = $state('');
	let shown = $state(false);
	let touch = $state(false);
	let at = $state({ x: 0, y: 0 });
	let size = $state({ w: 0, h: 0 });
	let view = $state({ w: 0, h: 0 });

	const place = $derived(tipPlacement(at, size, view, touch));

	/** The element whose title is set aside, while it is. */
	let host: HTMLElement | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let fade: ReturnType<typeof setTimeout> | null = null;
	/** Pressed since the pointer came over it: a tip after a click is noise. */
	let pressed = false;
	/** A finger's hold, from where it started, and whether its tip has shown. */
	let holding: { x: number; y: number; id: number } | null = null;
	let heldTip = false;
	let swallowUntil = 0;

	const titled = (target: EventTarget | null): HTMLElement | null =>
		target instanceof Element ? target.closest<HTMLElement>('[title], [data-tip]') : null;

	/** Set the title aside, so the browser's own tip stays away; re-read if it was set again. */
	function stash(el: HTMLElement) {
		const title = el.getAttribute('title');
		if (title !== null) {
			el.dataset.tip = title;
			el.removeAttribute('title');
		}
		text = el.dataset.tip ?? '';
	}

	function restore(el: HTMLElement) {
		if (el.dataset.tip !== undefined && !el.hasAttribute('title')) el.setAttribute('title', el.dataset.tip);
		delete el.dataset.tip;
	}

	function clearTimers() {
		if (timer) clearTimeout(timer);
		if (fade) clearTimeout(fade);
		timer = fade = null;
	}

	function leave() {
		clearTimers();
		shown = false;
		pressed = false;
		if (host) restore(host);
		host = null;
	}

	function show() {
		if (!host || !text.trim()) return;
		view = { w: window.innerWidth, h: window.innerHeight };
		shown = true;
	}

	function over(event: PointerEvent) {
		if (event.pointerType === 'touch') return;
		const el = titled(event.target);
		if (el === host) return;
		leave();
		if (!el) return;
		host = el;
		stash(el);
		touch = false;
		at = { x: event.clientX, y: event.clientY };
		timer = setTimeout(show, TIP_DELAY);
	}

	function out(event: PointerEvent) {
		if (event.pointerType === 'touch' || !host) return;
		const to = event.relatedTarget;
		if (to instanceof Node && host.contains(to)) return;
		leave();
	}

	function move(event: PointerEvent) {
		if (event.pointerType === 'touch') {
			if (!holding || holding.id !== event.pointerId) return;
			if (Math.hypot(event.clientX - holding.x, event.clientY - holding.y) > TIP_SLOP) {
				// Moving is dragging or scrolling, not asking.
				holding = null;
				if (heldTip) leave();
				else clearTimers();
			}
			return;
		}
		if (!host) return;
		// Svelte may have set the title again under the pointer — a button whose
		// hint changes with its state. Take the new words, and keep the native tip away.
		if (host.hasAttribute('title')) stash(host);
		at = { x: event.clientX, y: event.clientY };
		if (!shown && !pressed && !timer) timer = setTimeout(show, TIP_DELAY);
	}

	const typing = (el: Element) =>
		!!el.closest('textarea, [contenteditable=""], [contenteditable="true"]') ||
		(el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'color', 'file', 'range'].includes(el.type));

	function down(event: PointerEvent) {
		if (event.pointerType !== 'touch') {
			// A press answers the question the tip was about to.
			clearTimers();
			shown = false;
			pressed = true;
			return;
		}
		leave();
		const el = titled(event.target);
		if (!el || typing(event.target as Element) || el.closest('[data-no-hold-tip]')) return;
		holding = { x: event.clientX, y: event.clientY, id: event.pointerId };
		heldTip = false;
		timer = setTimeout(() => {
			timer = null;
			if (!holding) return;
			host = el;
			stash(el);
			touch = true;
			at = { x: holding.x, y: holding.y };
			heldTip = true;
			show();
			vibrate(HOLD_MS);
		}, TIP_HOLD);
	}

	function up(event: PointerEvent) {
		if (event.pointerType !== 'touch' || !holding || holding.id !== event.pointerId) return;
		holding = null;
		if (!heldTip) {
			clearTimers();
			return;
		}
		// Letting go of a hold is not a press: the click it would make is dropped.
		swallowUntil = performance.now() + 700;
		fade = setTimeout(leave, 1600);
	}

	function click(event: MouseEvent) {
		if (performance.now() > swallowUntil) return;
		swallowUntil = 0;
		event.preventDefault();
		event.stopPropagation();
	}

	/** The browser's own long-press menu would land on top of the tip. */
	function menu(event: Event) {
		if (heldTip && shown) event.preventDefault();
	}

	$effect(() => {
		const opts = { capture: true, passive: true } as const;
		document.addEventListener('pointerover', over, opts);
		document.addEventListener('pointerout', out, opts);
		document.addEventListener('pointermove', move, opts);
		document.addEventListener('pointerdown', down, opts);
		document.addEventListener('pointerup', up, opts);
		document.addEventListener('pointercancel', up, opts);
		document.addEventListener('click', click, true);
		document.addEventListener('contextmenu', menu, true);
		// Anything that moves the page or changes the subject puts the tip away.
		document.addEventListener('scroll', leave, opts);
		document.addEventListener('keydown', leave, opts);
		window.addEventListener('blur', leave);
		return () => {
			leave();
			document.removeEventListener('pointerover', over, opts);
			document.removeEventListener('pointerout', out, opts);
			document.removeEventListener('pointermove', move, opts);
			document.removeEventListener('pointerdown', down, opts);
			document.removeEventListener('pointerup', up, opts);
			document.removeEventListener('pointercancel', up, opts);
			document.removeEventListener('click', click, true);
			document.removeEventListener('contextmenu', menu, true);
			document.removeEventListener('scroll', leave, opts);
			document.removeEventListener('keydown', leave, opts);
			window.removeEventListener('blur', leave);
		};
	});
</script>

<!-- Hidden from assistive technology: what it says is the element's own
     title, which is back on the element as soon as the pointer leaves, and a
     screen reader reads that rather than anything a pointer hovers. -->
<div
	class="tip"
	class:shown
	aria-hidden="true"
	bind:offsetWidth={size.w}
	bind:offsetHeight={size.h}
	style="left:{place.x}px;top:{place.y}px"
>
	{text}
</div>

<style>
	/* Square and plain: a note beside the pointer, not a control of its own. */
	.tip {
		position: fixed;
		z-index: 1000;
		max-width: min(320px, calc(100vw - 12px));
		padding: 5px 8px;
		background: #1f1f1f;
		color: #fff;
		font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
		white-space: pre-line;
		overflow-wrap: anywhere;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		pointer-events: none;
		visibility: hidden;
	}

	.tip.shown {
		visibility: visible;
	}
</style>
