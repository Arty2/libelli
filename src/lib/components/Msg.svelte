<!--
	A message with rich text in it — `<strong>`, `<kbd>` — drawn as elements.
	The tags a message may use are this list and no other, each an element
	written here: the catalogue's text never reaches the page as markup, so a
	translation cannot add an attribute, a link or a script, and this file needs no raw-HTML block.
	A tag not on the list keeps its words and loses its element.
-->
<script lang="ts">
	import { rich, type MessageKey, type Part, type Values } from '$lib/i18n';

	let { id, values = {} }: { id: MessageKey; values?: Values } = $props();

	const parts = $derived(rich(id, values));
</script>

{#snippet draw(parts: Part[])}
	{#each parts as part, i (i)}
		{#if typeof part === 'string'}{part}{:else if part.tag === 'strong'}<strong>{@render draw(part.children)}</strong
			>{:else if part.tag === 'em'}<em>{@render draw(part.children)}</em
			>{:else if part.tag === 'kbd'}<kbd>{@render draw(part.children)}</kbd
			>{:else if part.tag === 'code'}<code>{@render draw(part.children)}</code
			>{:else}{@render draw(part.children)}{/if}
	{/each}
{/snippet}

{@render draw(parts)}
