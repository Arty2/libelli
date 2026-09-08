<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import { swipe } from '$lib/gestures';
	import { mmToPx } from '$lib/layout';
	import type { Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		/** which row is shown, and what the arrows step through */
		index: number;
		background: string | null;
		onactivate: (index: number) => void;
		onclose: () => void;
	}

	let { template, dataset, mapping, index, background, onactivate, onclose }: Props = $props();

	let viewport = $state({ w: 1200, h: 800 });

	const outerW = $derived(template.page.w + (template.bleed.enabled ? template.bleed.amount * 2 : 0));
	const outerH = $derived(template.page.h + (template.bleed.enabled ? template.bleed.amount * 2 : 0));
	const scale = $derived.by(() => {
		// The nav bar and its gap sit under the card and always need their band.
		// Sideways there is nothing but ground, and on a phone 120px of it is a
		// third of the screen — the same concession the editor's stage makes.
		const sides = viewport.w < 560 ? 24 : 120;
		return Math.min((viewport.h - 120) / mmToPx(outerH), (viewport.w - sides) / mmToPx(outerW));
	});

	$effect(() => {
		const read = () => (viewport = { w: window.innerWidth, h: window.innerHeight });
		read();
		window.addEventListener('resize', read);
		return () => window.removeEventListener('resize', read);
	});

	/**
	 * Which way the run is moving, so the arriving card knows which edge of the
	 * window to come in from. Zero on the way in, so opening the lightbox does
	 * not deal a card at you from a side you did not choose.
	 *
	 * Set before `onactivate`, which is what changes `index` and re-renders the
	 * card: the animation reads this on the way past, so it has to be true by
	 * then. A clamped step — next on the last card — leaves it alone, and there
	 * is nothing to animate anyway because the index did not move.
	 */
	let travel = $state(0);

	function step(to: number) {
		const next = Math.max(0, Math.min(dataset.rows.length - 1, to));
		if (next === index) return;
		travel = next > index ? 1 : -1;
		onactivate(next);
	}


	/**
	 * The lightbox owns these keys while it is open, so whatever opened it must
	 * leave Escape and the arrows alone until it closes.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			step(index + 1);
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			step(index - 1);
		}
	}

	// ---- tilt ---------------------------------------------------------------

	/**
	 * The card leans with the phone, the way a real one catches the light when you
	 * turn it. Deliberately small: this is the one card on screen, held close, and
	 * anything more than a few degrees stops reading as a card and starts reading
	 * as a carousel.
	 *
	 * Two things drive it. A gyroscope, where there is one to read, and a finger
	 * or a pointer dragged across the card — the same gesture on a desk that
	 * turning the phone is in the hand, and the only one available on a machine
	 * with no sensors in it. Neither runs against `prefers-reduced-motion`: a
	 * moving picture is exactly what that setting is asking us not to draw, and
	 * a drag that leans the card is still a moving picture.
	 */
	const TILT_MAX = 7;
	/**
	 * And a little roll with it.
	 *
	 * A real card held loosely does not turn with the hand — it hangs, and stays
	 * level in the world while the phone rotates around it. On screen that reads
	 * as a counter-rotation: roll the phone clockwise and the card appears to
	 * turn anticlockwise, because it is the frame that moved and not the card.
	 * Hence the negative sign at both call sites; with the sign the other way the
	 * card turned *with* the phone, which is what a sticker on the glass does.
	 *
	 * Much smaller than the lean, because roll is the one axis with a right
	 * answer already on the card: the type is level, and anything past a couple
	 * of degrees stops reading as a card catching the light and starts reading as
	 * a crooked print.
	 */
	const ROLL_MAX = 2.5;
	/** how far the phone turns to reach that lean, in degrees */
	const TILT_RANGE = 24;
	/** how much of the way to the target each frame moves; raw readings jitter */
	const TILT_EASE = 0.12;

	let tilt = $state({ x: 0, y: 0, z: 0 });
	/**
	 * Where the sheen sits across the card, as a background position.
	 *
	 * Driven by the lean rather than by the raw reading, so it moves with what
	 * you can see happening and a drag carries it too. It travels further than
	 * the card turns — a band that moved only seven degrees' worth would not
	 * read as moving at all — but not so far that it leaves: at the ends of the
	 * range the flanks are still crossing the paper, because foil that goes
	 * blank when you tilt it is just a card again.
	 */
	const sheen = $derived(50 - (tilt.y / TILT_MAX) * 34);

	/**
	 * Whether a gyroscope is actually feeding us, as against merely existing.
	 *
	 * Set on the first reading rather than on the capability check, because iOS
	 * hands the readings out only after a grant that may never come: a card
	 * wearing a highlight that cannot move is a smudge on the artwork, not a
	 * sheen. It gates the foil and nothing else — the lean and the roll are
	 * driven by a finger too, and want no gate.
	 */
	let sensed = $state(false);

	/**
	 * Whatever way the phone is being held when the lightbox opens is level: a
	 * baseline taken from the first reading, so the card starts flat on a desk, in
	 * a hand, or lying in bed rather than snapping to attention.
	 */
	let baseline: { beta: number; gamma: number } | null = null;
	let target = { x: 0, y: 0, z: 0 };

	/**
	 * What a drag is adding on top of that, and where it started.
	 *
	 * Added rather than replacing, so a phone that has both keeps both: a lean
	 * you have introduced with your thumb rides on the lean the handset is
	 * already showing. It springs back to nothing on release, because a card you
	 * have let go of should not stay crooked — and because there is no gesture
	 * for putting it back.
	 */
	const DRAG_MAX = 9;
	/** how far the pointer travels to reach that lean, in pixels */
	const DRAG_RANGE = 260;
	let dragTilt = { x: 0, y: 0, z: 0 };
	let dragFrom: { x: number; y: number; id: number } | null = null;
	/**
	 * Whether the pointer moved enough to be a drag rather than a click. The
	 * backdrop closes on click, and turning the card and then letting go over the
	 * ground either side of it must not put it away.
	 */
	let dragged = $state(false);

	function tiltDown(event: PointerEvent) {
		if (event.button !== 0) return;
		dragFrom = { x: event.clientX, y: event.clientY, id: event.pointerId };
		dragged = false;
	}

	function tiltMove(event: PointerEvent) {
		if (!dragFrom || event.pointerId !== dragFrom.id) return;
		const dx = event.clientX - dragFrom.x;
		const dy = event.clientY - dragFrom.y;
		if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged = true;
		const lean = (px: number) =>
			(Math.max(-DRAG_RANGE, Math.min(DRAG_RANGE, px)) / DRAG_RANGE) * DRAG_MAX;
		// Dragging right turns the card's left edge towards you, which is a
		// positive rotateY; dragging down tips the top towards you, a positive
		// rotateX. The roll rides on the sideways half and resists it, as the
		// gyroscope's does — push the card sideways and its mass lags behind.
		const across = lean(dx);
		dragTilt = { x: lean(dy), y: across, z: -(across / DRAG_MAX) * ROLL_MAX };
	}

	function tiltUp(event: PointerEvent) {
		if (!dragFrom || event.pointerId !== dragFrom.id) return;
		dragFrom = null;
		dragTilt = { x: 0, y: 0, z: 0 };
	}

	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		// The settle loop runs whether or not there is a gyroscope, because the
		// drag needs it too — it used to be started only on the sensor path, so a
		// machine with a mouse and no accelerometer had nothing easing anything.
		const sensing =
			window.matchMedia('(pointer: coarse)').matches && 'DeviceOrientationEvent' in window;

		let frame = 0;

		const onOrientation = (event: DeviceOrientationEvent) => {
			const { beta, gamma } = event;
			if (beta === null || gamma === null) return;
			baseline ??= { beta, gamma };
			sensed = true;

			// Turning the phone on its side swaps which way is left and which way is
			// forward; the reading is in the device's frame, so rotate it into the
			// screen's before it becomes a lean.
			const angle = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
			const dBeta = beta - baseline.beta;
			const dGamma = gamma - baseline.gamma;
			const acrossScreen = dGamma * Math.cos(angle) + dBeta * Math.sin(angle);
			const downScreen = dBeta * Math.cos(angle) - dGamma * Math.sin(angle);

			const lean = (degrees: number) =>
				(Math.max(-TILT_RANGE, Math.min(TILT_RANGE, degrees)) / TILT_RANGE) * TILT_MAX;
			// Tipping the top away leans the card away, so the axes cross over: a
			// forward tilt is a rotation about X, a sideways one about Y. The roll
			// rides on the same sideways reading — one wrist, one movement — at a
			// fraction of the angle, and against it: the card hangs level while the
			// phone turns around it.
			const across = lean(acrossScreen);
			target = { x: -lean(downScreen), y: across, z: -(across / TILT_MAX) * ROLL_MAX };
		};

		const settle = () => {
			// The sensor's lean and the drag's, added: a phone that has both keeps
			// both, and a machine with neither sits at zero and costs one lerp a
			// frame that never moves.
			const to = {
				x: target.x + dragTilt.x,
				y: target.y + dragTilt.y,
				z: target.z + dragTilt.z
			};
			tilt = {
				x: tilt.x + (to.x - tilt.x) * TILT_EASE,
				y: tilt.y + (to.y - tilt.y) * TILT_EASE,
				z: tilt.z + (to.z - tilt.z) * TILT_EASE
			};
			frame = requestAnimationFrame(settle);
		};

		// iOS hands the readings out only after an explicit grant, and only asks
		// when a gesture is in flight — so the first touch inside the lightbox is
		// what asks. Everywhere else the listener goes straight on.
		// Read through `window`, not as a bare global: the early return that
		// guaranteed the global existed is gone — the settle loop runs without a
		// sensor now — and a bare reference would throw where there is none.
		const orientation = (window as unknown as Record<string, unknown>).DeviceOrientationEvent as
			| { requestPermission?: () => Promise<string> }
			| undefined;
		const request = orientation?.requestPermission;

		const listen = () => window.addEventListener('deviceorientation', onOrientation);

		let ask: ((event: Event) => void) | null = null;
		if (!sensing) {
			// No sensor to ask for; the drag is the whole of it here.
		} else if (typeof request === 'function') {
			ask = () => {
				window.removeEventListener('pointerdown', ask!);
				ask = null;
				request.call(orientation).then(
					(state) => state === 'granted' && listen(),
					() => {
						/* declined, or not available here; the card simply stays flat */
					}
				);
			};
			window.addEventListener('pointerdown', ask);
		} else {
			listen();
		}

		frame = requestAnimationFrame(settle);

		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('deviceorientation', onOrientation);
			if (ask) window.removeEventListener('pointerdown', ask);
			baseline = null;
			sensed = false;
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<!-- The swipe is on the whole screen, not just on the card: on a phone the card
     is most of it, and a flick that starts on the ground either side of it is
     the same gesture. `swipe` is touch-only, so a click-drag on a desktop still
     selects and still closes. -->
<div
	class="full"
	role="presentation"
	onclick={() => {
		// A drag that ends over the ground either side of the card is a drag, not
		// a click on the backdrop, and must not put the card away.
		if (!dragged) onclose();
		dragged = false;
	}}
	onpointerdown={tiltDown}
	onpointermove={tiltMove}
	onpointerup={tiltUp}
	onpointercancel={tiltUp}
	onpointerleave={tiltUp}
	use:swipe={(by) => step(index + by)}
>
	<button class="plain close" onclick={onclose} title="Close" aria-label="Close">
		<Icon name="close" size={22} />
	</button>
	<!-- Keyed on the index so the node is rebuilt on every step, which is what
	     re-runs the deal animation below — a CSS animation on a node that merely
	     had its props changed would never play a second time. -->
	{#key index}
	<div
		class="full-card"
		role="presentation"
		onclick={(e) => e.stopPropagation()}
		style="width:{mmToPx(outerW) * scale}px;height:{mmToPx(outerH) *
			scale}px;--travel:{travel};transform:perspective(1100px) rotateX({tilt.x}deg) rotateY({tilt.y}deg) rotateZ({tilt.z}deg)"
	>
		<span class="scaler" style="transform:scale({scale})">
			<Card
				{template}
				row={dataset.rows[index]}
				{mapping}
				pageNumber={index + 1}
				pageCount={dataset.rows.length}
				{background}
			/>
		</span>
		{#if sensed}
			<!-- The foil. Only where a gyroscope is feeding us, because this is the
			     one thing on the card that is *about* the light in the room: without
			     a real orientation to move against it is a painted-on smear.
			     `aria-hidden`, and outside the scaler, so it covers the card rather
			     than scaling with the artwork. -->
			<span class="foil" aria-hidden="true" style="--sheen:{sheen}%"></span>
		{/if}
	</div>
	{/key}
	<!-- Under the card with the count between them: the two arrows and the
	     number are one control, and either side of the page they were a
	     screen-width apart from what they act on. -->
	<div class="nav-bar" role="presentation" onclick={(e) => e.stopPropagation()}>
		<button class="plain" disabled={index === 0} onclick={() => step(index - 1)} aria-label="Previous card">
			<Icon name="caret-left" size={26} />
		</button>
		<span class="counter">{index + 1} / {dataset.rows.length}</span>
		<button
			class="plain"
			disabled={index === dataset.rows.length - 1}
			onclick={() => step(index + 1)}
			aria-label="Next card"
		>
			<Icon name="caret-right" size={26} />
		</button>
	</div>
</div>

<style>
	.full {
		position: fixed;
		inset: 0;
		z-index: 60;
		/* Dragging across the card turns it; it must not also sweep a blue
		   highlight over every word on it. Nothing in here is text you copy —
		   this is the card as it will print, held up to be looked at, and the
		   words are back in the table if you want them. Selection starts at
		   whatever the press landed on, so refusing it here is enough to stop
		   the drag from reaching the editor behind as well. */
		user-select: none;
		-webkit-user-select: none;
		/* Every touch in here is already ours: a horizontal flick pages the run
		   and a drag in any direction turns the card. Handing the browser none of
		   them is what stops a downward drag being read as pull-to-refresh — the
		   one gesture this app can least afford, since a reload takes the undo
		   history with it, and here it is the same movement as turning the card.
		   `overscroll-behavior` in app.css covers the scroll chain; this covers
		   the gesture itself, on the one screen with nothing to scroll. */
		touch-action: none;
		background: rgba(20, 20, 20, 0.82);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
	}

	/* No button around them: over a dark ground these are white marks on the
	   image, and a bordered chip would be one more thing to look past. */
	.plain {
		border: none;
		background: none;
		padding: 4px;
		color: #fff;
		cursor: pointer;
		display: grid;
		place-items: center;
	}

	.plain:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.plain.close {
		position: absolute;
		top: 14px;
		right: 18px;
	}

	.nav-bar {
		display: flex;
		align-items: center;
		gap: 22px;
	}

	.full-card {
		background: #fff;
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		/* The lean is drawn, not laid out: the card keeps the pixels it was given
		   whichever way it is facing, so nothing under it moves. */
		transform-origin: center;
		will-change: transform, translate;
	}

	/* Stepping the run deals the next card in from off the screen.

	   On `translate`, not on `transform`: the tilt owns `transform` and rewrites
	   it every frame, so an animation there would fight the gyroscope for the
	   same property. The individual transform properties compose with it — the
	   used matrix is translate × transform — so the card arrives already leaning
	   whichever way the phone is held.

	   `--travel` is 0 on the way in, which makes the animation a move from
	   nowhere to nowhere: opening the lightbox should not deal a card at you
	   from a side you did not choose. 110vw guarantees it starts past the edge of
	   the window whatever the card's own width. */
	@media (prefers-reduced-motion: no-preference) {
		.full-card {
			animation: deal 300ms cubic-bezier(0.22, 0.61, 0.36, 1);
		}
	}

	@keyframes deal {
		from {
			translate: calc(var(--travel, 0) * 110vw);
		}
	}

	/* Foil.

	   A band swept across the card as it turns, made of three things: a specular
	   core and a cool and a warm flank. The core is white, which is invisible on
	   white paper and exactly right — a highlight on a matt white card *is*
	   nothing — and shows up where the artwork is dark, which is where a real one
	   would. The flanks are what you see on the paper: a breath of blue on one
	   side of the core and of amber on the other, which is the whole of what
	   makes a foil read as foil rather than as a torch being shone at it.

	   Plain alpha compositing, no blend mode. `overlay` and `soft-light` both
	   resolve to nothing against a white base, which is most of a card, so the
	   effect would have been visible only on the photographs.

	   Everything here is deliberately at the edge of noticing. Foil that
	   announces itself on a proofing tool is a distraction from the proof. */
	.foil {
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: 0.55;
		background-image: linear-gradient(
			104deg,
			rgba(255, 255, 255, 0) 34%,
			rgba(120, 190, 255, 0.13) 44%,
			rgba(255, 255, 255, 0.5) 50%,
			rgba(255, 200, 130, 0.13) 56%,
			rgba(255, 255, 255, 0) 66%
		);
		/* Wider than the card, so the band can travel right off both edges rather
		   than compressing towards the middle as it reaches the end of its run. */
		background-size: 320% 100%;
		background-position: var(--sheen, 50%) 0;
		background-repeat: no-repeat;
	}

	.scaler {
		display: block;
		transform-origin: top left;
	}

	.counter {
		color: #fff;
		font: 24px ui-sans-serif, system-ui, sans-serif;
		min-width: 6rem;
		text-align: center;
	}
</style>
