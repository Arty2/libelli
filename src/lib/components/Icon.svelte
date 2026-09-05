<script lang="ts">
	import { ICONS } from '$lib/icons';

	interface Props {
		name: string;
		/** rendered edge length in px; the viewBox is always 32 */
		size?: number;
	}

	let { name, size = 16 }: Props = $props();
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- ICONS is a constant in this repo, never user input -->
<svg viewBox="0 0 32 32" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false"
	>{@html ICONS[name] ?? ''}</svg
>

<style>
	svg {
		display: block;
		flex: none;
	}
</style>
