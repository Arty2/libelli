<script lang="ts" generics="T extends string">
	/**
	 * The tabs along the top of an option bar: one subject showing at a time.
	 *
	 * Every setting in a bar at once was four or five wrapped rows of forty
	 * controls, all the same weight, so finding Width meant reading past
	 * Baseline. A tab is one press away and says what is behind it.
	 *
	 * A dot on a tab says something behind it has been set away from its
	 * default — an area that sets its own type rather than the page's — so
	 * that stays visible from the other tabs.
	 */
	interface Props {
		/** `dot`, when there is one, is what it means on this tab — its tip */
		tabs: Array<{ value: T; label: string; dot?: string | false }>;
		value: T;
		onselect: (value: T) => void;
	}

	let { tabs, value, onselect }: Props = $props();
</script>

<span class="tabs">
	{#each tabs as tab (tab.value)}
		<button class="tab" aria-pressed={tab.value === value} onclick={() => onselect(tab.value)}>
			{tab.label}
			{#if tab.dot}<span class="dot" title={tab.dot}></span>{/if}
		</button>
	{/each}
</span>
