<script lang="ts">
	import Icon from './Icon.svelte';
	import type { AlignEdge } from '$lib/layout';
	import type { Arrange } from '$lib/template';
	import type { Box, Template } from '$lib/types';

	interface Props {
		/** the box the menu was opened on */
		box: Box;
		/** everything the actions will apply to; `box` is one of them */
		selectedBoxes: Box[];
		template: Template;
		/** viewport coordinates of the click that opened this */
		x: number;
		y: number;
		onarrange: (where: Arrange) => void;
		onalign: (edge: AlignEdge) => void;
		ongroup: () => void;
		onlock: (locked: boolean) => void;
		onduplicate: () => void;
		ondelete: () => void;
		onclose: () => void;
	}

	let {
		box,
		template,
		selectedBoxes,
		x,
		y,
		onarrange,
		onalign,
		ongroup,
		onlock,
		onduplicate,
		ondelete,
		onclose
	}: Props = $props();

	const many = $derived(selectedBoxes.length > 1);
	const plural = $derived(many ? ` ${selectedBoxes.length} Boxes` : '');
	const grouped = $derived(
		many && selectedBoxes.every((b) => b.group) && new Set(selectedBoxes.map((b) => b.group)).size === 1
	);

	/** The same six the selection bar offers, as one row rather than six lines. */
	const ALIGN_EDGES: Array<{ value: AlignEdge; icon: string; label: string }> = [
		{ value: 'left', icon: 'obj-left', label: 'Align Left' },
		{ value: 'centre-x', icon: 'obj-centre-x', label: 'Centre Horizontally' },
		{ value: 'right', icon: 'obj-right', label: 'Align Right' },
		{ value: 'top', icon: 'obj-top', label: 'Align Top' },
		{ value: 'centre-y', icon: 'obj-centre-y', label: 'Centre Vertically' },
		{ value: 'bottom', icon: 'obj-bottom', label: 'Align Bottom' }
	];

	const frozen = $derived(!!template.locked);
	// Nowhere to go when the selection already occupies the end it is being sent to.
	const positions = $derived(
		selectedBoxes.map((b) => template.boxes.findIndex((one) => one.id === b.id)).sort((a, b) => a - b)
	);
	const atFront = $derived(positions.every((p, i) => p === template.boxes.length - positions.length + i));
	const atBack = $derived(positions.every((p, i) => p === i));

	let menu = $state<HTMLDivElement | null>(null);

	/** Keep the menu on screen when the click was near an edge. */
	const position = $derived.by(() => {
		if (!menu || typeof window === 'undefined') return { left: x, top: y };
		const { width, height } = menu.getBoundingClientRect();
		return {
			left: Math.min(x, window.innerWidth - width - 8),
			top: Math.min(y, window.innerHeight - height - 8)
		};
	});

	function run(action: () => void) {
		action();
		onclose();
	}
</script>

<svelte:window
	onkeydown={(e) => e.key === 'Escape' && onclose()}
	onresize={onclose}
/>

<!-- A backdrop rather than a blur handler: a click anywhere, including on
     another box, should close this before it does anything else. -->
<div class="backdrop" role="presentation" oncontextmenu={(e) => e.preventDefault()} onpointerdown={onclose}></div>

<div
	class="menu"
	bind:this={menu}
	role="menu"
	aria-label="Box actions"
	tabindex="-1"
	style="left:{position.left}px;top:{position.top}px"
>
	<!-- With several chosen the menu carries what the selection bar carries: the
	     alignments as an icon row, because six of them as six lines would bury
	     everything else. -->
	{#if many}
		<div class="align-row" role="group" aria-label="Align">
			{#each ALIGN_EDGES as option (option.value)}
				<button
					title={option.label}
					aria-label={option.label}
					disabled={frozen}
					onclick={() => run(() => onalign(option.value))}
				>
					<Icon name={option.icon} size={15} />
				</button>
			{/each}
		</div>

		<hr />
	{/if}

	<!-- Several move as a block, keeping their order relative to each other. -->
	<button role="menuitem" disabled={frozen || atFront} onclick={() => run(() => onarrange('front'))}>
		<Icon name="bring-to-front" size={15} /> Bring to Front
	</button>
	<button role="menuitem" disabled={frozen || atFront} onclick={() => run(() => onarrange('forward'))}>
		<Icon name="bring-forward" size={15} /> Bring Forward
	</button>
	<button role="menuitem" disabled={frozen || atBack} onclick={() => run(() => onarrange('backward'))}>
		<Icon name="send-backward" size={15} /> Send Backward
	</button>
	<button role="menuitem" disabled={frozen || atBack} onclick={() => run(() => onarrange('back'))}>
		<Icon name="send-to-back" size={15} /> Send to Back
	</button>

	<hr />

	{#if many}
		<button role="menuitem" disabled={frozen} onclick={() => run(ongroup)}>
			<Icon name="layers" size={15} />
			{grouped ? 'Ungroup' : 'Group'}
		</button>
	{/if}
	<button role="menuitem" disabled={frozen} onclick={() => run(() => onlock(!box.locked))}>
		<Icon name="locked" size={15} />
		{box.locked ? 'Unlock' : 'Lock'}{plural}
	</button>
	<button role="menuitem" disabled={frozen} onclick={() => run(onduplicate)}>
		<Icon name="copy" size={15} /> Duplicate{plural}
	</button>
	<button class="danger" role="menuitem" disabled={frozen || (!many && !!box.locked)} onclick={() => run(ondelete)}>
		<Icon name="trash" size={15} /> Delete{plural}
	</button>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 70;
	}

	.menu {
		position: fixed;
		z-index: 71;
		min-width: 11.5rem;
		padding: 4px;
		background: #fff;
		border: 1px solid #ddd;
		border-radius: 6px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
	}

	button {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px;
		border: none;
		border-radius: var(--radius-button);
		background: transparent;
		color: #111;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		text-align: left;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: #eef3fb;
	}

	button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	button.danger {
		color: #b42318;
	}

	button.danger:hover:not(:disabled) {
		background: #fdf3f2;
	}

	hr {
		margin: 4px 6px;
		border: none;
		border-top: 1px solid #eee;
	}

	.align-row {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 1px;
		padding: 2px;
	}

	.align-row button {
		width: auto;
		justify-content: center;
		padding: 6px 0;
	}
</style>
