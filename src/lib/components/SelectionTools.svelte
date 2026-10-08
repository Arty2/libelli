<script lang="ts">
	import Icon from './Icon.svelte';
	import { withKey } from '$lib/keys';
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
		/**
		 * Which copy this is. On a desk one column holds everything, beside undo.
		 * On a phone that column is the align buttons alone, and the count and
		 * what acts on the set go under the right-hand column (`side`) — the
		 * left edge was a column of ten, as tall as the page it sat over.
		 */
		place?: 'rail' | 'side';
	}

	let { boxes, frozen, onalign, ongroup, onlock, onduplicate, ondelete, place = 'rail' }: Props = $props();

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
<div class="tools {place}" role="toolbar" aria-label="Selection" aria-orientation="vertical">
	<span class="count act" aria-hidden="true">{boxes.length}</span>

	{#if place === 'rail'}
		{#each ALIGN_EDGES as option (option.value)}
			<button title={option.label} aria-label={option.label} disabled={frozen} onclick={() => onalign(option.value)}>
				<Icon name={option.icon} size={16} />
			</button>
		{/each}

		<hr class="act" />
	{/if}

	<button
		class="act"
		aria-pressed={grouped}
		title={grouped ? 'Ungroup' : 'Group — move, lock and delete these as one'}
		aria-label={grouped ? 'Ungroup' : 'Group'}
		disabled={frozen}
		onclick={ongroup}
	>
		<Icon name={grouped ? 'ungroup-objects' : 'group-objects'} size={16} />
	</button>
	<button
		class="act"
		aria-pressed={allLocked}
		title={allLocked ? 'Unlock all of them' : 'Lock all of them'}
		aria-label={allLocked ? 'Unlock' : 'Lock'}
		disabled={frozen}
		onclick={onlock}
	>
		<Icon name="locked" size={16} />
	</button>
	<!-- Not on a phone: there it is in the area's menu, a long press away, and
	     the side column has room for the few a set is most often used for. -->
	{#if place === 'rail'}
		<button class="act" title={withKey('Duplicate', 'duplicate')} aria-label="Duplicate" disabled={frozen} onclick={onduplicate}>
			<Icon name="replicate" size={16} />
		</button>
	{/if}
	<button class="act danger" title={withKey('Delete', 'delete')} aria-label="Delete" disabled={frozen || allLocked} onclick={ondelete}>
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
		overscroll-behavior: contain;
	}

	/* The desk's one column, or the phone's two: the same breakpoint the app
	   stacks at (`stacked` in +page.svelte). Both copies are in the DOM at
	   every width, as the corners' short and long labels are, so crossing it
	   costs nothing. */
	.side {
		display: none;
	}

	@media (max-width: 900px) {
		.rail .act {
			display: none;
		}

		.side {
			display: flex;
		}
	}

	.count {
		font: 600 0.625rem ui-sans-serif, system-ui, sans-serif;
		color: #767676;
		padding: 1px 0 3px;
	}

	button {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-button);
		background: #fff;
		color: #333;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: var(--accent-wash);
		border-color: var(--border-control-hover);
	}

	button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	button[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-tint);
	}

	button.danger {
		color: #b42318;
	}

	button.danger:hover:not(:disabled) {
		background: #fdf3f2;
		border-color: #f0c9c5;
	}

	hr {
		width: 1.125rem;
		margin: 3px 0;
		border: none;
		border-top: 1px solid #ddd;
	}
</style>
