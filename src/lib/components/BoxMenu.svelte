<script lang="ts">
	import Icon from './Icon.svelte';
	import type { Arrange } from '$lib/template';
	import type { Box, Template } from '$lib/types';

	interface Props {
		box: Box;
		template: Template;
		/** viewport coordinates of the click that opened this */
		x: number;
		y: number;
		onarrange: (where: Arrange) => void;
		onlock: (locked: boolean) => void;
		onduplicate: () => void;
		ondelete: () => void;
		onclose: () => void;
	}

	let { box, template, x, y, onarrange, onlock, onduplicate, ondelete, onclose }: Props = $props();

	const frozen = $derived(!!template.locked);
	const index = $derived(template.boxes.findIndex((b) => b.id === box.id));
	const atFront = $derived(index === template.boxes.length - 1);
	const atBack = $derived(index === 0);

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

	<button role="menuitem" disabled={frozen} onclick={() => run(() => onlock(!box.locked))}>
		<Icon name="locked" size={15} />
		{box.locked ? 'Unlock' : 'Lock'}
	</button>
	<button role="menuitem" disabled={frozen} onclick={() => run(onduplicate)}>
		<Icon name="copy" size={15} /> Duplicate
	</button>
	<button class="danger" role="menuitem" disabled={frozen || !!box.locked} onclick={() => run(ondelete)}>
		<Icon name="trash" size={15} /> Delete
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
</style>
