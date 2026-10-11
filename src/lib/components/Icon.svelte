<script lang="ts">
	import { ICONS } from '$lib/icons';

	interface Props {
		name: string;
		/** edge length in px at the default text size; the viewBox is always 32 */
		size?: number;
		/**
		 * Leave the size to the caller's stylesheet, with `size` in px only as
		 * the fallback. An icon is otherwise in `rem`, so a button grows round
		 * its icon as it grows round its label (see textsize.ts). The badges on
		 * an area pass this: they are sized against the editor's zoom, and an
		 * inline size here outranked that rule, so the glyph grew with the page
		 * while the badge round it held still.
		 */
		fixed?: boolean;
	}

	let { name, size = 16, fixed = false }: Props = $props();
	// No inline size when fixed: the width and height attributes stand as
	// presentational hints, which any stylesheet rule overrides.
	const edge = $derived(fixed ? undefined : `${size / 16}rem`);
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
