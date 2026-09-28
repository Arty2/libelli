<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * The × beside a value that has been set, taking it back to the one it
	 * would otherwise have. Clearing a field is how that was always done, but
	 * nothing said so: a set value and an inherited one looked the same, and a
	 * select had no blank to clear to.
	 */
	interface Props {
		/** what pressing it goes back to, for the tip — "the page's 10pt" */
		to: string;
		onclick: () => void;
		disabled?: boolean;
	}

	let { to, onclick, disabled = false }: Props = $props();
</script>

<button class="reset" title="Back to {to}" aria-label="Back to {to}" {disabled} {onclick}>
	<Icon name="close" size={12} />
</button>
