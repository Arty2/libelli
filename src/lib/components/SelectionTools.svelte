<script lang="ts">
	import Icon from './Icon.svelte';
	import type { AlignEdge } from '$lib/layout';
	import type { Box } from '$lib/types';

	interface Props {
		boxes: Box[];
		frozen: boolean;
		onalign: (edge: AlignEdge) => void;
		ongroup: () => void;
		onlock: () => void;
		onduplicate: () => void;
		ondelete: () => void;
	}

	let { boxes, frozen, onalign, ongroup, onlock, onduplicate, ondelete }: Props = $props();

	const allLocked = $derived(boxes.length > 0 && boxes.every((b) => b.locked));
	const grouped = $derived(
		boxes.length > 1 && boxes.every((b) => b.group) && new Set(boxes.map((b) => b.group)).size === 1
	);

	const ALIGN_EDGES: Array<{ value: AlignEdge; icon: string; label: string }> = [
		{ value: 'left', icon: 'obj-left', label: 'Align Left' },
		{ value: 'centre-x', icon: 'obj-centre-x', label: 'Centre Horizontally' },
		{ value: 'right', icon: 'obj-right', label: 'Align Right' },
		{ value: 'top', icon: 'obj-top', label: 'Align Top' },
		{ value: 'centre-y', icon: 'obj-centre-y', label: 'Centre Vertically' },
		{ value: 'bottom', icon: 'obj-bottom', label: 'Align Bottom' }
	];
</script>

<!-- Under undo, redo and the stacking column: these appear only when there is
     more than one box chosen, so they belong beside the page rather than
     pushing the options bar around every time a second box is picked up. Icons
     only — the count and the wording live in the right-click menu. -->
<div class="tools" role="toolbar" aria-label="Selection" aria-orientation="vertical">
	<span class="count" aria-hidden="true">{boxes.length}</span>

	{#each ALIGN_EDGES as option (option.value)}
		<button title={option.label} aria-label={option.label} disabled={frozen} onclick={() => onalign(option.value)}>
			<Icon name={option.icon} size={16} />
		</button>
	{/each}

	<hr />

	<button
		aria-pressed={grouped}
		title={grouped ? 'Ungroup' : 'Group — move, lock and delete these as one'}
		aria-label={grouped ? 'Ungroup' : 'Group'}
		disabled={frozen}
		onclick={ongroup}
	>
		<Icon name="layers" size={16} />
	</button>
	<button
		aria-pressed={allLocked}
		title={allLocked ? 'Unlock all of them' : 'Lock all of them'}
		aria-label={allLocked ? 'Unlock' : 'Lock'}
		disabled={frozen}
		onclick={onlock}
	>
		<Icon name="locked" size={16} />
	</button>
	<button title="Duplicate" aria-label="Duplicate" disabled={frozen} onclick={onduplicate}>
		<Icon name="copy" size={16} />
	</button>
	<button class="danger" title="Delete" aria-label="Delete" disabled={frozen || allLocked} onclick={ondelete}>
		<Icon name="trash" size={16} />
	</button>
</div>

<style>
	.tools {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 4px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.92);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
		/* Ten tools is taller than a short viewport; the rail scrolls rather than
		   running off the bottom of the page it sits beside. */
		max-height: calc(100dvh - 220px);
		overflow-y: auto;
	}

	.count {
		font: 600 10px ui-sans-serif, system-ui, sans-serif;
		color: #767676;
		padding: 1px 0 3px;
	}

	button {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-button);
		background: #fff;
		color: #333;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: #eef3fb;
		border-color: var(--border-control-hover);
	}

	button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	button[aria-pressed='true'] {
		border-color: #2563eb;
		color: #2563eb;
		background: #eaf1fe;
	}

	button.danger {
		color: #b42318;
	}

	button.danger:hover:not(:disabled) {
		background: #fdf3f2;
		border-color: #f0c9c5;
	}

	hr {
		width: 18px;
		margin: 3px 0;
		border: none;
		border-top: 1px solid #ddd;
	}
</style>
