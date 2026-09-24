<script lang="ts">
	import Icon from './Icon.svelte';
	import './options-bar.css';
	import {
		chooseImageFolder,
		deleteImage,
		folderAvailable,
		forgetImageFolder,
		imageFolder,
		listImages,
		reopenImageFolder,
		type FolderState,
		type ImageRecord
	} from '$lib/assets';

	/**
	 * Where the pictures are, what they weigh, and how to get rid of them.
	 *
	 * The app can hold a run of photographs, and until there was a bar like
	 * this they were invisible: browser storage is a bucket you cannot look
	 * into, and the only way to clear it was to clear everything the app had
	 * ever saved. So: a list, a weight against each one, and a folder to put
	 * them in instead where the browser offers one.
	 */

	interface Props {
		/** names the current table and template actually point at */
		used: Set<string>;
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
		/** the pictures changed: whoever resolved them should do it again */
		onchanged: () => void;
	}

	let { used, onnotice, onchanged }: Props = $props();

	const available = folderAvailable();
	let folder = $state<FolderState | null>(null);
	let images = $state<ImageRecord[]>([]);
	let busy = $state(true);

	async function refresh() {
		busy = true;
		folder = await imageFolder();
		images = await listImages();
		busy = false;
	}

	$effect(() => {
		void refresh();
	});

	const total = $derived(images.reduce((sum, image) => sum + image.bytes, 0));

	/** Kilobytes under a megabyte, one decimal above it; nobody wants 1483 KB. */
	const weigh = (bytes: number) =>
		bytes >= 1024 * 1024 ? `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

	async function choose() {
		const chosen = await chooseImageFolder();
		if (!chosen) return;
		onnotice(`Pictures go into ${chosen.name} from now on. The ones already in this browser stay where they are.`);
		await refresh();
		onchanged();
	}

	async function reopen() {
		const state = await reopenImageFolder();
		if (!state?.ready) {
			onnotice('That folder was not opened, so pictures are coming from this browser.', 'warning');
			return;
		}
		await refresh();
		onchanged();
	}

	async function forget() {
		await forgetImageFolder();
		onnotice('Let go of the folder. Nothing in it was deleted — this app has simply stopped reading it.');
		await refresh();
		onchanged();
	}

	async function remove(image: ImageRecord) {
		await deleteImage(image.name, image.where);
		onnotice(
			`${image.name} deleted.` +
				(used.has(image.name) ? ' The areas pointing at it will draw nothing until it is put back.' : '')
		);
		await refresh();
		onchanged();
	}
</script>

<!--
	A bar in the options row, not a dialog: the pictures are looked at beside
	the card that uses them, and a dialog over the card hid exactly that. Words
	only where they are a control or a fact — a folder's name, a weight, whether
	anything uses it; the explanations are in the README and in the titles.
-->
<div class="options images-bar" aria-label="Images">
	<span class="head">
		<span class="head-row">
			<span class="context">Images</span>
			<span class="where" title={available ? '' : 'Choosing a folder needs a Chromium browser'}>
				{#if folder?.ready}
					<Icon name="folder" size={12} /> {folder.name}
				{:else if folder}
					{folder.name} — not opened
				{:else}
					In this browser
				{/if}
			</span>
		</span>
		{#if available}
			<span class="head-row">
				{#if folder && !folder.ready}
					<button class="primary" onclick={reopen}>Open {folder.name}</button>
				{/if}
				<button
					title="Keep pictures as ordinary files in a folder of your own, rather than in this browser's storage"
					onclick={choose}>{folder ? 'Another Folder…' : 'Choose Folder…'}</button
				>
				{#if folder}
					<button title="Stop reading the folder. Nothing in it is deleted" onclick={forget}>Forget</button>
				{/if}
			</span>
		{/if}
	</span>

	{#if busy}
		<span class="empty">…</span>
	{:else if !images.length}
		<span class="empty">None stored</span>
	{:else}
		<span class="total">{images.length} · {weigh(total)}</span>
		<ul class="images">
			{#each images as image (image.where + image.name)}
				<!-- Whether anything currently points at it, because "which of these
				     forty can I delete" is the only question this bar is for. -->
				<li class:unused={!used.has(image.name)} title="{image.name} — {image.where === 'folder' ? 'in the folder' : 'in this browser'}, {used.has(image.name) ? 'in use' : 'unused'}">
					<span class="name">{image.name}</span>
					<span class="size">{weigh(image.bytes)}</span>
					{#if !used.has(image.name)}<span class="tag">unused</span>{/if}
					<button
						class="square"
						title="Delete {image.name}"
						aria-label="Delete {image.name}"
						onclick={() => void remove(image)}
					>
						<Icon name="trash" size={12} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.where {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #111;
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.images {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		list-style: none;
		margin: 0;
		padding: 0;
		flex: 1 1 20rem;
		min-width: 0;
	}

	.images li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 2px 2px 8px;
		border: 1px solid #ddd;
		border-radius: 999px;
		background: #fff;
		max-width: 18rem;
	}

	.images li.unused {
		border-style: dashed;
	}

	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.size,
	.total,
	.empty {
		color: #767676;
		font-variant-numeric: tabular-nums;
	}

	.tag {
		font: 600 9px/1 ui-sans-serif, system-ui, sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #b26a00;
	}

	.images li :global(button.square) {
		border: none;
		border-radius: 999px;
		width: 22px;
		height: 22px;
		padding: 0;
		justify-content: center;
		color: #767676;
	}

	.images li :global(button.square:hover) {
		color: #b42318;
		background: #fdf3f2;
	}

	.images-bar :global(button.primary) {
		background: #111;
		border-color: #111;
		color: #fff;
	}
</style>
