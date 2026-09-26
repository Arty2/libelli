<script lang="ts">
	import Icon from './Icon.svelte';
	import { t } from '$lib/strings';
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
	}

	let { boxes, frozen, onalign, ongroup, onlock, onduplicate, ondelete }: Props = $props();

	const allLocked = $derived(boxes.length > 0 && boxes.every((b) => b.locked));
	const grouped = $derived(
		boxes.length > 1 && boxes.every((b) => b.group) && new Set(boxes.map((b) => b.group)).size === 1
	);

	const ALIGN_EDGES: Array<{ value: AlignEdge; icon: string; label: string }> = [
		{ value: 'left', icon: 'obj-left', label: t.align.left },
		{ value: 'centre-x', icon: 'obj-centre-x', label: t.align.centreX },
		{ value: 'right', icon: 'obj-right', label: t.align.right },
		{ value: 'top', icon: 'obj-top', label: t.align.top },
		{ value: 'centre-y', icon: 'obj-centre-y', label: t.align.centreY },
		{ value: 'bottom', icon: 'obj-bottom', label: t.align.bottom }
	];
</script>

<!-- Under undo, redo and the stacking column: these appear only when there is
     more than one box chosen, so they belong beside the page rather than
     pushing the options bar around every time a second box is picked up. Icons
     only — the count and the wording live in the right-click menu. -->
<div class="tools" role="toolbar" aria-label={t.selectionTools.label} aria-orientation="vertical">
	<span class="count" aria-hidden="true">{boxes.length}</span>

	{#each ALIGN_EDGES as option (option.value)}
		<button title={option.label} aria-label={option.label} disabled={frozen} onclick={() => onalign(option.value)}>
			<Icon name={option.icon} size={16} />
		</button>
	{/each}

	<hr />

	<button
		aria-pressed={grouped}
		title={grouped ? t.common.ungroup : t.selectionTools.groupTitle}
		aria-label={grouped ? t.common.ungroup : t.common.group}
		disabled={frozen}
		onclick={ongroup}
	>
		<Icon name={grouped ? 'ungroup-objects' : 'group-objects'} size={16} />
	</button>
	<button
		aria-pressed={allLocked}
		title={allLocked ? t.selectionTools.unlockAll : t.selectionTools.lockAll}
		aria-label={allLocked ? t.common.unlock : t.common.lock}
		disabled={frozen}
		onclick={onlock}
	>
		<Icon name="locked" size={16} />
	</button>
	<button title={withKey(t.common.duplicate, 'duplicate')} aria-label={t.common.duplicate} disabled={frozen} onclick={onduplicate}>
		<Icon name="replicate" size={16} />
	</button>
	<button class="danger" title={withKey(t.common.delete, 'delete')} aria-label={t.common.delete} disabled={frozen || allLocked} onclick={ondelete}>
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
