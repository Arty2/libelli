<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import { GRID_MAJOR, GRID_MINOR, mmToPx } from '$lib/layout';
	import type { Box, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row: Row | null;
		mapping: Mapping;
		outlines: boolean;
		grid: boolean;
		selectedId: string | null;
		zoom: 'fit' | number;
		/** 1-based position of the previewed row, for the page number */
		pageNumber: number | null;
		/** the template's background image, resolved by the app */
		background: string | null;
		onselect: (id: string | null) => void;
		onchange: (box: Box) => void;
		onoutlines: (show: boolean) => void;
		ongrid: (show: boolean) => void;
		onzoom: (zoom: 'fit' | number) => void;
		onnudge: (dx: number, dy: number) => void;
		onlock: (locked: boolean) => void;
	}

	let {
		template,
		row,
		mapping,
		outlines,
		grid,
		selectedId,
		zoom,
		pageNumber,
		background,
		onselect,
		onchange,
		onoutlines,
		ongrid,
		onzoom,
		onnudge,
		onlock
	}: Props = $props();

	const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2];

	let host = $state<HTMLDivElement | null>(null);
	let hostSize = $state({ w: 0, h: 0 });
	/** the step the on-screen pad moves by; the keyboard has Shift for the same thing */
	let padStep = $state(1);

	const outerW = $derived(template.page.w + (template.bleed.enabled ? template.bleed.amount * 2 : 0));
	const outerH = $derived(template.page.h + (template.bleed.enabled ? template.bleed.amount * 2 : 0));

	const scale = $derived.by(() => {
		if (typeof zoom === 'number') return zoom;
		if (!hostSize.w || !hostSize.h) return 1;
		// Just enough room for the shadow and the corner chips. On a phone the
		// stage is the whole screen, so every millimetre of padding is a
		// millimetre of card you cannot see.
		const pad = hostSize.w < 560 ? 16 : 48;
		const fit = Math.min((hostSize.w - pad) / mmToPx(outerW), (hostSize.h - pad) / mmToPx(outerH));
		return Math.max(0.15, Math.min(fit, 2));
	});

	$effect(() => {
		if (!host) return;
		const observer = new ResizeObserver(([entry]) => {
			hostSize = { w: entry.contentRect.width, h: entry.contentRect.height };
		});
		observer.observe(host);
		return () => observer.disconnect();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="stage"
	bind:this={host}
	onpointerdown={(e) => {
		if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('sheet')) onselect(null);
	}}
	role="region"
	aria-label="Card preview"
	tabindex="-1"
>
	<div class="sheet" style="width:{mmToPx(outerW) * scale}px;height:{mmToPx(outerH) * scale}px">
		<div class="scaler" style="transform:scale({scale})">
			<Card
				{template}
				{row}
				{mapping}
				{outlines}
				{grid}
				{scale}
				{pageNumber}
				{background}
				interactive={true}
				{selectedId}
				{onselect}
				{onchange}
			/>
		</div>

		{#if grid}
			<!-- Drawn over the card, never inside it: this is editor furniture and
			     must not appear in a print or a contact sheet thumbnail. -->
			<div
				class="grid-overlay"
				aria-hidden="true"
				style="--minor:{mmToPx(GRID_MINOR) * scale}px;--major:{mmToPx(GRID_MAJOR) * scale}px"
			></div>
		{/if}

		<button
			class="page-lock"
			aria-pressed={!!template.locked}
			title={template.locked ? 'Unlock the design' : 'Lock the design — no dragging, no option changes'}
			onclick={() => onlock(!template.locked)}
		>
			<Icon name={template.locked ? 'locked' : 'unlocked'} size={14} />
		</button>
	</div>

	<!-- View state sits on the page it affects, one control per bottom corner,
	     rather than in the toolbar among the actions. -->
	<div class="corner left">
		<label title="{GRID_MAJOR}mm grid with a {GRID_MINOR}mm subgrid; dragging snaps to it">
			<input type="checkbox" checked={grid} onchange={(e) => ongrid(e.currentTarget.checked)} />
			Grid
		</label>
		<label title="Dashed box outlines and the trim edge — screen only, never printed">
			<input type="checkbox" checked={outlines} onchange={(e) => onoutlines(e.currentTarget.checked)} />
			Outlines
		</label>
	</div>

	<label class="corner right">
		<span class="sr-only">Zoom</span>
		<select
			value={zoom === 'fit' ? 'fit' : String(zoom)}
			onchange={(e) => onzoom(e.currentTarget.value === 'fit' ? 'fit' : Number(e.currentTarget.value))}
		>
			<option value="fit">Fit — {Math.round(scale * 100)}%</option>
			{#each ZOOM_STEPS as step (step)}
				<option value={String(step)}>{step * 100}%</option>
			{/each}
		</select>
	</label>

	{#if selectedId}
		<!-- Touch has no arrow keys, and dragging a 2mm nudge with a fingertip is
		     hopeless. Shown only where there is no keyboard to fall back on. -->
		<div class="pad" role="group" aria-label="Nudge the selected box">
			<button class="up" title="Up {padStep}mm" onclick={() => onnudge(0, -padStep)}><Icon name="caret-up" size={16} /></button>
			<button class="left" title="Left {padStep}mm" onclick={() => onnudge(-padStep, 0)}><Icon name="caret-left" size={16} /></button>
			<button
				class="step"
				title="Step size"
				onclick={() => (padStep = padStep === 1 ? GRID_MINOR : 1)}>{padStep}</button
			>
			<button class="right" title="Right {padStep}mm" onclick={() => onnudge(padStep, 0)}><Icon name="caret-right" size={16} /></button>
			<button class="down" title="Down {padStep}mm" onclick={() => onnudge(0, padStep)}><Icon name="caret-down" size={16} /></button>
		</div>
	{/if}
</div>

<style>
	.stage {
		position: relative;
		flex: 1;
		min-width: 0;
		display: grid;
		place-items: center;
		overflow: auto;
		padding: 24px;
		background: #eee;
	}

	.stage:focus-visible {
		outline: 2px solid #2563eb;
		outline-offset: -2px;
	}

	.sheet {
		position: relative;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
		background: #fff;
	}

	.scaler {
		transform-origin: top left;
	}

	.grid-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image:
			repeating-linear-gradient(to right, rgba(37, 99, 235, 0.28) 0 1px, transparent 1px var(--major)),
			repeating-linear-gradient(to bottom, rgba(37, 99, 235, 0.28) 0 1px, transparent 1px var(--major)),
			repeating-linear-gradient(to right, rgba(37, 99, 235, 0.13) 0 1px, transparent 1px var(--minor)),
			repeating-linear-gradient(to bottom, rgba(37, 99, 235, 0.13) 0 1px, transparent 1px var(--minor));
	}

	.page-lock {
		position: absolute;
		top: -12px;
		right: -12px;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		padding: 0;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: #fff;
		color: #555;
		cursor: pointer;
	}

	.page-lock[aria-pressed='true'] {
		border-color: #2563eb;
		color: #2563eb;
	}

	.corner {
		position: absolute;
		bottom: 10px;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font: 500 11px/1 ui-sans-serif, system-ui, sans-serif;
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

	.corner.left {
		left: 12px;
	}

	.corner.right {
		right: 12px;
		padding: 2px 3px;
	}

	.corner select {
		font: 500 11px ui-sans-serif, system-ui, sans-serif;
		color: #555;
		border: none;
		background: transparent;
		padding: 3px 4px;
	}

	.corner input {
		margin: 0;
	}

	.pad {
		position: absolute;
		right: 12px;
		bottom: 52px;
		display: none;
		grid-template-columns: repeat(3, 34px);
		grid-template-rows: repeat(3, 34px);
		gap: 2px;
		padding: 4px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.92);
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.16);
	}

	.pad button {
		display: grid;
		place-items: center;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: #fff;
		color: #333;
		font: 600 11px ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		padding: 0;
	}

	.pad .up { grid-area: 1 / 2; }
	.pad .left { grid-area: 2 / 1; }
	.pad .step { grid-area: 2 / 2; }
	.pad .right { grid-area: 2 / 3; }
	.pad .down { grid-area: 3 / 2; }

	@media (max-width: 900px) {
		.stage {
			padding: 8px;
		}

		.pad {
			display: grid;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
