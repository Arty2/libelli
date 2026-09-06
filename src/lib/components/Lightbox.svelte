<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
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

	const step = (to: number) => onactivate(Math.max(0, Math.min(dataset.rows.length - 1, to)));

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
	 * Only where there is a gyroscope to read and no keyboard-and-mouse to make it
	 * pointless, and never against `prefers-reduced-motion` — a moving picture is
	 * exactly what that setting is asking us not to draw.
	 */
	const TILT_MAX = 7;
	/** how far the phone turns to reach that lean, in degrees */
	const TILT_RANGE = 24;
	/** how much of the way to the target each frame moves; raw readings jitter */
	const TILT_EASE = 0.12;

	let tilt = $state({ x: 0, y: 0 });

	/**
	 * Whatever way the phone is being held when the lightbox opens is level: a
	 * baseline taken from the first reading, so the card starts flat on a desk, in
	 * a hand, or lying in bed rather than snapping to attention.
	 */
	let baseline: { beta: number; gamma: number } | null = null;
	let target = { x: 0, y: 0 };

	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		if (!window.matchMedia('(pointer: coarse)').matches) return;
		if (!('DeviceOrientationEvent' in window)) return;

		let frame = 0;

		const onOrientation = (event: DeviceOrientationEvent) => {
			const { beta, gamma } = event;
			if (beta === null || gamma === null) return;
			baseline ??= { beta, gamma };

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
			// forward tilt is a rotation about X, a sideways one about Y.
			target = { x: -lean(downScreen), y: lean(acrossScreen) };
		};

		const settle = () => {
			tilt = {
				x: tilt.x + (target.x - tilt.x) * TILT_EASE,
				y: tilt.y + (target.y - tilt.y) * TILT_EASE
			};
			frame = requestAnimationFrame(settle);
		};

		// iOS hands the readings out only after an explicit grant, and only asks
		// when a gesture is in flight — so the first touch inside the lightbox is
		// what asks. Everywhere else the listener goes straight on.
		const request = (
			DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
		).requestPermission;

		const listen = () => window.addEventListener('deviceorientation', onOrientation);

		let ask: ((event: Event) => void) | null = null;
		if (typeof request === 'function') {
			ask = () => {
				window.removeEventListener('pointerdown', ask!);
				ask = null;
				request.call(DeviceOrientationEvent).then(
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
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="full" role="presentation" onclick={onclose}>
	<button class="plain close" onclick={onclose} title="Close" aria-label="Close">
		<Icon name="close" size={22} />
	</button>
	<div
		class="full-card"
		role="presentation"
		onclick={(e) => e.stopPropagation()}
		style="width:{mmToPx(outerW) * scale}px;height:{mmToPx(outerH) *
			scale}px;transform:perspective(1100px) rotateX({tilt.x}deg) rotateY({tilt.y}deg)"
	>
		<span class="scaler" style="transform:scale({scale})">
			<Card {template} row={dataset.rows[index]} {mapping} pageNumber={index + 1} {background} />
		</span>
	</div>
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
		will-change: transform;
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
