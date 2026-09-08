<script lang="ts">
	import Icon from './Icon.svelte';
	import type { AlignEdge } from '$lib/layout';
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
		/** whether every click is currently adding to or dropping from the selection */
		picking: boolean;
		/** whether there is a look on the clipboard to paste */
		hasStyle: boolean;
		onalign: (edge: AlignEdge) => void;
		ongroup: () => void;
		onlock: (locked: boolean) => void;
		onduplicate: () => void;
		ondelete: () => void;
		onpicking: (on: boolean) => void;
		oncopystyle: () => void;
		onpastestyle: () => void;
		onclose: () => void;
	}

	let {
		box,
		template,
		selectedBoxes,
		x,
		y,
		picking,
		hasStyle,
		onalign,
		ongroup,
		onlock,
		onduplicate,
		ondelete,
		onpicking,
		oncopystyle,
		onpastestyle,
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
	aria-label="Area actions"
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

	<!-- First, because it changes what every click after it means: with this on,
	     each area you press joins the selection or leaves it, which is what a
	     shift-click does on a keyboard and what a touchscreen has no way to say. -->
	<button
		role="menuitemcheckbox"
		aria-checked={picking}
		class:on={picking}
		onclick={() => run(() => onpicking(!picking))}
	>
		<Icon name={picking ? 'checkbox-checked' : 'checkbox'} size={15} />
		{picking ? 'Stop Selecting Multiple' : 'Select Multiple'}
	</button>

	<hr />

	<button role="menuitem" disabled={frozen} onclick={() => run(() => onlock(!box.locked))}>
		<Icon name={box.locked ? 'unlocked' : 'locked'} size={15} />
		{box.locked ? 'Unlock' : 'Lock'}{plural}
	</button>

	<hr />

	<!-- Stacking order is not here any more: it is the column beside the page,
	     which is where it belongs — it is about where an area sits on the sheet,
	     and it wants to be pressed four times in a row rather than reopened from
	     a menu between each press. -->
	<button role="menuitem" onclick={() => run(oncopystyle)}>
		<Icon name="copy" size={15} /> Copy Style
		<span class="chord">Ctrl/⌘ ⇧ C</span>
	</button>
	<button role="menuitem" disabled={frozen || !hasStyle} onclick={() => run(onpastestyle)}>
		<Icon name="paste" size={15} /> Paste Style{plural}
		<span class="chord">Ctrl/⌘ ⇧ V</span>
	</button>

	<hr />

	{#if many}
		<button role="menuitem" disabled={frozen} onclick={() => run(ongroup)}>
			<Icon name="layers" size={15} />
			{grouped ? 'Ungroup' : 'Group'}
		</button>
	{/if}
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

	/* The keys that do the same thing, greyed and pushed to the right edge: a
	   menu is where you find out what the chord is, not a second place to be
	   told what the item does. */
	.chord {
		margin-left: auto;
		padding-left: 12px;
		font: 10px ui-monospace, SFMono-Regular, Menlo, monospace;
		color: #aaa;
	}

	button.on {
		color: #2563eb;
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
