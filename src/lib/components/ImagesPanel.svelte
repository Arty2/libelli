<script lang="ts">
	import Icon from './Icon.svelte';
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
	 * The app can hold a run of photographs, and until there was a panel like
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

<!-- The offer, or the reason there is no offer. Said either way: a control
     that is simply absent in half the browsers is a feature nobody can tell
     they are missing. -->
<p class="where">
	{#if !available}
		This browser keeps pictures in its own storage. Choosing a folder for them needs a Chromium
		browser — Chrome, Edge, Opera, Arc — where the file picker this uses exists.
	{:else if folder?.ready}
		Pictures go into <strong>{folder.name}</strong>. They are ordinary files: replace them from
		anywhere, and clearing them out is what your file manager is for.
	{:else if folder}
		<strong>{folder.name}</strong> is remembered, but this browser wants to be let in again — it
		asks once per visit, and until then pictures come from this browser's own storage.
	{:else}
		Pictures are kept in this browser, which is a bucket you cannot look into and the browser may
		empty. A folder of your own holds them as ordinary files instead.
	{/if}
</p>

{#if available}
	<div class="folder-actions">
		{#if folder && !folder.ready}
			<button class="primary" onclick={reopen}>Open {folder.name}</button>
		{/if}
		<button onclick={choose}>{folder ? 'Choose another folder…' : 'Choose a folder…'}</button>
		{#if folder}
			<button onclick={forget}>Forget it</button>
		{/if}
	</div>
{/if}

{#if busy}
	<p class="empty">Looking…</p>
{:else if !images.length}
	<p class="empty">No pictures stored. Drop an image onto an area, or upload one as a background.</p>
{:else}
	<ul class="images">
		{#each images as image (image.where + image.name)}
			<li>
				<span class="name" title={image.name}>{image.name}</span>
				<span class="size">{weigh(image.bytes)}</span>
				<span class="tag" class:folder={image.where === 'folder'}>
					{image.where === 'folder' ? 'folder' : 'browser'}
				</span>
				<!-- Whether anything currently points at it, because "which of these
				     forty can I delete" is the only question this panel is for. -->
				<span class="tag" class:used={used.has(image.name)}>
					{used.has(image.name) ? 'in use' : 'unused'}
				</span>
				<button
					class="square"
					title="Delete {image.name}"
					aria-label="Delete {image.name}"
					onclick={() => void remove(image)}
				>
					<Icon name="trash" size={14} />
				</button>
			</li>
		{/each}
	</ul>
	<p class="total">{images.length} picture{images.length === 1 ? '' : 's'} · {weigh(total)}</p>
{/if}

<style>
	/* The panel's own controls: the page's button styles are scoped to the page,
	   and this is a component. Same shape, said once. */
	button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 6px 10px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-button);
		background: #fff;
		color: #111;
		cursor: pointer;
	}

	button:hover {
		border-color: var(--border-control-hover);
	}

	button.primary {
		background: #111;
		border-color: #111;
		color: #fff;
	}

	button.square {
		padding: 5px;
	}

	.where {
		margin: 0 0 12px;
		font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
		color: #444;
	}

	.folder-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 14px;
	}

	.images {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 46vh;
		overflow: auto;
		border: 1px solid #e3e3e3;
		border-radius: var(--radius-button);
	}

	.images li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		font: 13px ui-sans-serif, system-ui, sans-serif;
		border-bottom: 1px solid #f0f0f0;
	}

	.images li:last-child {
		border-bottom: none;
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.size {
		color: #555;
		font-variant-numeric: tabular-nums;
	}

	/* Two words that are facts, not buttons: grey unless they are the answer to
	   the question the panel is for — the folder, and whether it is in use. */
	.tag {
		font: 600 10px/1 ui-sans-serif, system-ui, sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #767676;
		border: 1px solid #ddd;
		border-radius: 999px;
		padding: 3px 7px;
	}

	.tag.folder {
		color: #1d4ed8;
		border-color: #c7d7f8;
		background: #eef3fb;
	}

	.tag.used {
		color: #1f7a3f;
		border-color: #c3e3ce;
		background: #eef7f1;
	}

	.total,
	.empty {
		margin: 10px 0 0;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		color: #555;
	}
</style>
