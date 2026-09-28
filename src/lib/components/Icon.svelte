<script lang="ts">
	import { ICONS } from '$lib/icons';

	interface Props {
		name: string;
		/** edge length in px at the default text size; the viewBox is always 32 */
		size?: number;
		/**
		 * Keep to `size` in px whatever the text size. An icon is otherwise in
		 * `rem`, so a button grows round its icon as it grows round its label
		 * (see textsize.ts); the badges drawn on an area are sized to the page
		 * they sit on, not to the interface, and pass this.
		 */
		fixed?: boolean;
	}

	let { name, size = 16, fixed = false }: Props = $props();
	const edge = $derived(fixed ? `${size}px` : `${size / 16}rem`);
</script>

<!-- eslint-disable svelte/no-at-html-tags -- ICONS is a constant in this repo, never user input -->
<svg
	viewBox="0 0 32 32"
	width={size}
	height={size}
	style:width={edge}
	style:height={edge}
	fill="currentColor"
	aria-hidden="true"
	focusable="false">{@html ICONS[name] ?? ''}</svg
>
<!-- eslint-enable svelte/no-at-html-tags -->

<style>
	svg {
		display: block;
		flex: none;
	}
</style>
