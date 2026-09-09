<script lang="ts">
	/**
	 * Picks the bar for the half of the editor it is mounted in.
	 *
	 * The two bars were one 1433-line file, which is what any change to either
	 * had to be read out of. They share no markup and no state — only the
	 * stylesheet, which is now options-bar.css — so the only thing left in
	 * common is this switch and the prop list both call sites pass.
	 */
	import BoxOptions from './BoxOptions.svelte';
	import PageOptions from './PageOptions.svelte';
	import type { Box, Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		/** which half of the editor this instance is: the two never share a row */
		section: 'page' | 'box';
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		selected: Box | null;
		onboxchange: (box: Box) => void;
		ontemplatechange: (template: Template) => void;
		onmappingchange: (mapping: Mapping) => void;
		onduplicate: () => void;
		ondelete: () => void;
		onresettemplate: () => void;
		onuploadfont: (file: File) => void;
		onuploadbackground: (file: File) => void;
		onuploadprintbackground: (file: File) => void;
		/** say something in the status bar; the bar has nowhere of its own to say it */
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
		onimporttemplate: () => void;
		onexporttemplate: () => void;
		oneditcss: () => void;
	}

	let { section, ...rest }: Props = $props();

	let boxBar = $state<BoxOptions | null>(null);

	/** Forwarded so the page can put the cursor in a new area's Text field. */
	export function focusText() {
		boxBar?.focusText();
	}
</script>

{#if section === 'page'}
	<PageOptions {...rest} />
{:else if rest.selected}
	<BoxOptions bind:this={boxBar} {...rest} selected={rest.selected} />
{/if}
