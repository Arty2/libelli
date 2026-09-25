<script lang="ts" module>
	/** One choice in the menu, or a rule between runs of them. */
	export type MenuItem =
		| {
				value: string;
				label: string;
				/** set the label in this family — the font menus show each face in itself */
				family?: string;
				title?: string;
				disabled?: boolean;
		  }
		| { rule: true };
</script>

<script lang="ts">
	import Icon from './Icon.svelte';
	import { fontStack } from '$lib/fonts';

	/**
	 * A select, drawn the way the template picker is drawn: the value on a
	 * line, a caret against the line, and a menu of its own with a tick by the
	 * current choice and rules between runs.
	 *
	 * The native `<select>` it replaces could not do two things asked of it —
	 * look like the picker beside it, and show a font's name in that font — and
	 * no amount of styling reaches inside a native list on every platform. The
	 * menu is `position: fixed` and measured as it opens, like the picker's, so
	 * no bar or scroller it sits in can clip it.
	 */

	interface Props {
		items: MenuItem[];
		value: string;
		onselect: (value: string) => void;
		/** what a screen reader calls the control */
		label: string;
		title?: string;
		disabled?: boolean;
		/** told when the menu opens, so a font menu can fetch what it previews */
		onopen?: () => void;
		/** show the current value in its own family, as the list does */
		showFamily?: boolean;
	}

	let { items, value, onselect, label, title, disabled = false, onopen, showFamily = false }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let menu = $state<HTMLElement | null>(null);
	let at = $state<{ left?: number; right?: number; top?: number; bottom?: number; maxHeight: number }>({
		left: 0,
		maxHeight: 320
	});

	const choices = $derived(items.filter((item): item is Extract<MenuItem, { value: string }> => !('rule' in item)));
	const current = $derived(choices.find((item) => item.value === value));

	function place() {
		const box = trigger?.getBoundingClientRect();
		if (!box) return;
		const below = window.innerHeight - box.bottom - 8;
		const above = box.top - 8;
		// Down where there is room, up where there is more of it — the zoom sits
		// in the bottom corner of the stage, and a menu hung below it is off the
		// screen.
		// And from whichever edge of the trigger is further from the window's:
		// the zoom's trigger is at the right of the stage, and a menu reaching
		// rightwards from it ran under the table beside the page.
		const side =
			box.left + box.width / 2 > window.innerWidth / 2
				? { right: Math.max(8, window.innerWidth - box.right) }
				: { left: Math.max(8, Math.min(box.left, window.innerWidth - 216)) };
		at =
			below >= 240 || below >= above
				? { ...side, top: box.bottom + 4, maxHeight: Math.max(120, below) }
				: { ...side, bottom: window.innerHeight - box.top + 4, maxHeight: Math.max(120, above) };
	}

	async function toggle() {
		if (disabled) return;
		if (open) {
			open = false;
			return;
		}
		place();
		open = true;
		onopen?.();
		// The current choice in view and focused, so the arrows start from it.
		await Promise.resolve();
		requestAnimationFrame(() => {
			const chosen = menu?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu?.querySelector<HTMLElement>('button:not(:disabled)');
			chosen?.scrollIntoView({ block: 'nearest' });
			chosen?.focus({ preventScroll: true });
		});
	}

	function choose(next: string) {
		open = false;
		trigger?.focus();
		if (next !== value) onselect(next);
	}

	function onMenuKey(event: KeyboardEvent) {
		const buttons = [...(menu?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		const go = (index: number) => buttons[(index + buttons.length) % buttons.length]?.focus();
		if (event.key === 'ArrowDown') go(at + 1);
		else if (event.key === 'ArrowUp') go(at - 1);
		else if (event.key === 'Home') go(0);
		else if (event.key === 'End') go(buttons.length - 1);
		else if (event.key === 'Escape' || event.key === 'Tab') {
			// Stopped, or the page's own Escape closes something behind this.
			event.stopPropagation();
			open = false;
			if (event.key === 'Escape') trigger?.focus();
			else return;
		} else return;
		event.preventDefault();
	}

	function onTriggerKey(event: KeyboardEvent) {
		if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
			event.preventDefault();
			void toggle();
		}
	}

	function onWindowPointer(event: PointerEvent) {
		if (!open || root?.contains(event.target as Node)) return;
		open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointer} onresize={() => (open = false)} />

<span class="menu-select" bind:this={root}>
	<button
		bind:this={trigger}
		class="trigger"
		type="button"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="{label}: {current?.label ?? value}"
		title={title ?? current?.title}
		{disabled}
		onclick={toggle}
		onkeydown={onTriggerKey}
	>
		<span class="value" style={showFamily && current?.family ? `font-family:${fontStack(current.family, '')}` : ''}
			>{current?.label ?? value}</span
		>
		<Icon name="caret-down" size={18} />
	</button>
	{#if open}
		<ul
			bind:this={menu}
			class="menu"
			role="menu"
			aria-label={label}
			style="{at.left !== undefined ? `left:${at.left}px` : `right:${at.right}px`};{at.top !== undefined
				? `top:${at.top}px`
				: `bottom:${at.bottom}px`};max-height:{at.maxHeight}px"
			onkeydown={onMenuKey}
		>
			{#each items as item, i (i)}
				{#if 'rule' in item}
					<li role="separator"><hr /></li>
				{:else}
					<li role="none">
						<button
							type="button"
							role="menuitemradio"
							aria-checked={item.value === value}
							title={item.title}
							disabled={item.disabled}
							onclick={() => choose(item.value)}
						>
							<span class="tick" aria-hidden="true">
								{#if item.value === value}<Icon name="checkmark" size={16} />{/if}
							</span>
							<span style={item.family ? `font-family:${fontStack(item.family, '')}` : ''}>{item.label}</span>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</span>

<style>
	.menu-select {
		position: relative;
		display: inline-flex;
		min-width: 0;
	}

	/* The value on a line with the caret against it — the template picker's
	   shape, so the bar's selects and its one text field read as one kind of
	   control. */
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-width: 0;
		max-width: 100%;
		padding: 3px 0 3px 2px;
		border: none;
		border-bottom: 1px solid var(--border-control);
		border-radius: 0;
		background: transparent;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		color: #111;
		cursor: pointer;
		text-align: left;
	}

	.trigger:hover:not(:disabled) {
		border-bottom-color: var(--border-control-hover);
	}

	.trigger:disabled {
		border-bottom-color: transparent;
		color: #999;
		cursor: default;
	}

	.trigger :global(svg) {
		flex: none;
		color: #555;
	}

	.value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.menu {
		position: fixed;
		z-index: 60;
		min-width: 12rem;
		max-width: min(20rem, calc(100vw - 16px));
		overflow-y: auto;
		overscroll-behavior: contain;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: #fff;
		border: 1px solid #d5d5d5;
		border-radius: 6px;
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
	}

	.menu button {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		border: none;
		background: none;
		padding: 5px 8px;
		border-radius: 4px;
		font: 13px ui-sans-serif, system-ui, sans-serif;
		color: #111;
		text-align: left;
		cursor: pointer;
		overflow-wrap: anywhere;
	}

	.menu button:hover:not(:disabled),
	.menu button:focus-visible {
		background: #f0f0f0;
		outline: none;
	}

	.menu button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.tick {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: 1rem;
		color: #1a5fb4;
	}

	.menu hr {
		margin: 4px 2px;
		border: none;
		border-top: 1px solid #e2e2e2;
	}
</style>
