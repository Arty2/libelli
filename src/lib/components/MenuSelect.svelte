<script lang="ts" module>
	/** One choice in the menu, a rule between runs of them, or a run's heading. */
	export type MenuItem =
		| {
				value: string;
				label: string;
				/** set the label in this family — the font menus show each face in itself */
				family?: string;
				title?: string;
				disabled?: boolean;
		  }
		| { rule: true }
		| { heading: string };

	/**
	 * Every font menu's families, each name set in its own face, under a
	 * heading for where it comes from: Local, then Google Fonts, then System
	 * (`fontChoices`). One list for the page's Font, an area's, and a font's
	 * Replace, which leaves out the font being replaced (`except`) and puts
	 * the system faces before Google's (`order`): there it is a choice of what
	 * this computer already has before what must be fetched, a rule between
	 * the runs (`ruled`). A run with nothing in it has no heading either.
	 */
	export type FamilySource = 'local' | 'google' | 'system';
	const SOURCE_HEADINGS: Record<FamilySource, string> = { local: 'Local', google: 'Google Fonts', system: 'System' };
	export function familyItems(
		choices: Record<FamilySource, string[]>,
		except?: string,
		order: FamilySource[] = ['local', 'google', 'system'],
		ruled = false
	): MenuItem[] {
		const keep = (family: string) => family.toLowerCase() !== except?.toLowerCase();
		const runs = order
			.map((source) => ({ source, kept: choices[source].filter(keep) }))
			.filter((run) => run.kept.length);
		return runs.flatMap(({ source, kept }, i): MenuItem[] => [
			...(ruled && i > 0 ? [{ rule: true as const }] : []),
			{ heading: SOURCE_HEADINGS[source] },
			...kept.map((family) => ({ value: family, label: family, family }))
		]);
	}
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
		/**
		 * No rule under the value: for a control that already sits on a chip of
		 * its own — the zoom, in the stage's corner — where a line under the
		 * value would be a second edge. The rule is the menu's once it opens.
		 */
		bare?: boolean;
		/**
		 * A second press within a moment of the first: the menu the first
		 * opened is shut again and this runs instead. The zoom's toggle between
		 * Fit and the zoom before it.
		 */
		ondouble?: () => void;
		/**
		 * What the trigger says while the value is none of the choices: an
		 * action rather than a setting — *Replace…* — whose value is never kept.
		 */
		placeholder?: string;
	}

	let {
		items,
		value,
		onselect,
		label,
		title,
		disabled = false,
		onopen,
		showFamily = false,
		bare = false,
		ondouble,
		placeholder
	}: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let menu = $state<HTMLElement | null>(null);
	let at = $state<{ left?: number; right?: number; top?: number; bottom?: number; maxHeight: number }>({
		left: 0,
		maxHeight: 320
	});

	const choices = $derived(items.filter((item): item is Extract<MenuItem, { value: string }> => 'value' in item));
	const current = $derived(choices.find((item) => item.value === value));

	function place() {
		const box = trigger?.getBoundingClientRect();
		if (!box) return;
		// The screen a person can see, not the layout's: on a phone the
		// browser's own bars and a pinch can leave less of the window showing,
		// and a menu measured to the window ran under them.
		const view = window.visualViewport;
		const height = view ? view.offsetTop + view.height : window.innerHeight;
		const width = view ? view.offsetLeft + view.width : window.innerWidth;
		const below = height - box.bottom - 8;
		const above = box.top - (view?.offsetTop ?? 0) - 8;
		// Down where there is room, up where there is more of it — the zoom sits
		// in the bottom corner of the stage, and a menu hung below it is off the
		// screen.
		// And from whichever edge of the trigger is further from the window's:
		// the zoom's trigger is at the right of the stage, and a menu reaching
		// rightwards from it ran under the table beside the page.
		const side =
			box.left + box.width / 2 > width / 2
				? { right: Math.max(8, window.innerWidth - Math.min(box.right, width - 8)) }
				: { left: Math.max(8, Math.min(box.left, width - 216)) };
		// Never more than the room on its side: a floor taller than the room
		// pushed the menu's end off the screen.
		at =
			below >= 240 || below >= above
				? { ...side, top: box.bottom + 4, maxHeight: below - 4 }
				: { ...side, bottom: window.innerHeight - box.top + 4, maxHeight: above - 4 };
	}

	/**
	 * Timed here rather than left to `dblclick`: a phone may not send one for
	 * two taps, and may zoom the whole page on them instead (the trigger's
	 * `touch-action` says not to). Two presses the same distance apart are one
	 * double on a mouse and a finger alike.
	 */
	const DOUBLE_MS = 350;
	let lastPress = -Infinity;

	async function press() {
		const now = performance.now();
		if (ondouble && now - lastPress < DOUBLE_MS) {
			lastPress = -Infinity;
			open = false;
			ondouble();
			return;
		}
		lastPress = now;
		await toggle();
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
		class:bare
		type="button"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="{label}: {current?.label ?? placeholder ?? value}"
		title={title ?? current?.title}
		{disabled}
		onclick={press}
		onkeydown={onTriggerKey}
	>
		<span class="value" style={showFamily && current?.family ? `font-family:${fontStack(current.family, '')}` : ''}
			>{current?.label ?? placeholder ?? value}</span
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
				{:else if 'heading' in item}
					<li role="presentation" class="heading">{item.heading}</li>
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
		font: 0.75rem ui-sans-serif, system-ui, sans-serif;
		color: #111;
		cursor: pointer;
		text-align: left;
	}

	/* Two taps are the control's own double, not the browser's zoom. */
	.trigger {
		touch-action: manipulation;
	}

	.trigger:hover:not(:disabled) {
		border-bottom-color: var(--border-control-hover);
	}

	.trigger.bare,
	.trigger.bare:hover:not(:disabled) {
		border-bottom-color: transparent;
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
		/* Its padding and border inside the height `place` measured for it. */
		box-sizing: border-box;
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

	/* A run's name, quieter than its choices, as the bar's legends are; in
	   line with the choices' names, past the tick column. */
	.menu .heading {
		padding: 8px 8px 2px 30px;
		font: 600 0.6875rem ui-sans-serif, system-ui, sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #666;
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
		font: 0.8125rem ui-sans-serif, system-ui, sans-serif;
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
		color: var(--accent-strong);
	}

	.menu hr {
		margin: 4px 2px;
		border: none;
		border-top: 1px solid #e2e2e2;
	}
</style>
