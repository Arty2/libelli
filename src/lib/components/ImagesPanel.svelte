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
		resolveLocalImages,
		storeLocalImage,
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
		/** a picture carried out of the bar and let go over an area */
		onplace: (boxId: string, name: string) => void;
		/** …or over the page but no area: a new area for it, where it was let go */
		onplacepage: (name: string, clientX: number, clientY: number) => void;
	}

	let { used, onnotice, onchanged, onplace, onplacepage }: Props = $props();

	const available = folderAvailable();
	let folder = $state<FolderState | null>(null);
	let images = $state<ImageRecord[]>([]);
	let busy = $state(true);

	/** Object URLs for the thumbnails, by name — the same cache the card reads. */
	let urls = $state<Record<string, string>>({});
	/** Pixel sizes, read off each thumbnail as it loads. */
	let sizes = $state<Record<string, { w: number; h: number }>>({});

	async function refresh() {
		busy = true;
		folder = await imageFolder();
		images = await listImages();
		urls = (await resolveLocalImages(images.map((image) => image.name))).urls;
		busy = false;
	}

	/**
	 * Pictures in from a file picker. The folder is Chromium's alone, and
	 * until this there was no way to put a picture into this browser from a
	 * phone except dropping a file on an area — which a phone cannot do. Where
	 * they go is where every picture goes: the folder when there is one, this
	 * browser otherwise.
	 */
	let fileInput = $state<HTMLInputElement | null>(null);

	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])].filter((file) => file.type.startsWith('image/'));
		input.value = '';
		if (!files.length) return;
		const names: string[] = [];
		for (const file of files) names.push(await storeLocalImage(file));
		await refresh();
		onchanged();
		onnotice(
			`${names.length === 1 ? names[0] : `${names.length} pictures`} added. Drag ${names.length === 1 ? 'it' : 'one'} onto an area to use ${names.length === 1 ? 'it' : 'it there'}.`
		);
	}

	/**
	 * Carrying a picture onto an area.
	 *
	 * Pointer events rather than HTML drag and drop, which a touchscreen does
	 * not do — and a phone is where this bar is the only way to put a picture
	 * on a card. The thumbnail is the grip: a press that travels is a carry,
	 * and where it is let go the element under the finger says which area, by
	 * the same `data-box-id` the card puts on every area.
	 */
	const CARRY_SLOP = 6;
	let carry = $state<{ id: number; name: string; x: number; y: number; on: boolean } | null>(null);

	function startCarry(event: PointerEvent, name: string) {
		if (event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		carry = { id: event.pointerId, name, x: event.clientX, y: event.clientY, on: false };
	}

	/**
	 * The area the picture would land in, marked while it is carried — the
	 * same promise a file dragged in from outside gets. An attribute rather
	 * than a class, because the card renders its areas' classes itself and
	 * would take a foreign one off again; the card's stylesheet draws it.
	 */
	let target: HTMLElement | null = null;

	function aim(x: number, y: number): HTMLElement | null {
		const area = document.elementFromPoint(x, y)?.closest<HTMLElement>('.trim [data-box-id]') ?? null;
		if (area === target) return area;
		target?.removeAttribute('data-image-target');
		area?.setAttribute('data-image-target', '');
		target = area;
		return area;
	}

	function moveCarry(event: PointerEvent) {
		if (!carry || carry.id !== event.pointerId) return;
		if (!carry.on && Math.hypot(event.clientX - carry.x, event.clientY - carry.y) < CARRY_SLOP) return;
		carry = { ...carry, x: event.clientX, y: event.clientY, on: true };
		aim(event.clientX, event.clientY);
	}

	function endCarry(event: PointerEvent) {
		if (!carry || carry.id !== event.pointerId) return;
		const { on, name } = carry;
		carry = null;
		if (!on || event.type === 'pointercancel') {
			aim(-1, -1);
			return;
		}
		const area = aim(event.clientX, event.clientY);
		aim(-1, -1);
		if (area?.dataset.boxId) onplace(area.dataset.boxId, name);
		else if (document.elementFromPoint(event.clientX, event.clientY)?.closest('.viewport .sheet'))
			onplacepage(name, event.clientX, event.clientY);
		else onnotice('Let go over the page to put the picture on it — over an area to put it in that one.');
	}

	$effect(() => {
		void refresh();
	});

	const total = $derived(images.reduce((sum, image) => sum + image.bytes, 0));

	/**
	 * Unused first, then by name: the list is mostly consulted to clear out
	 * what nothing points at, so that is what should be at the top. A filter
	 * appears once there are enough pictures to need one.
	 */
	const FILTER_FROM = 8;
	let filter = $state('');
	const shown = $derived(
		images
			.filter((image) => !filter.trim() || image.name.toLowerCase().includes(filter.trim().toLowerCase()))
			.sort(
				(a, b) =>
					Number(used.has(a.name)) - Number(used.has(b.name)) || a.name.localeCompare(b.name)
			)
	);

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
	<!-- One line: what this is, how many and how heavy, then the ways in. The
	     folder is named only once there is one — "in this browser" was a label
	     on the case nobody had chosen. -->
	<span class="head">
		<span class="head-row">
			<span class="context">Images</span>
			{#if images.length}
				<span class="total">{images.length} · {weigh(total)}</span>
			{/if}
			{#if folder}
				<span class="where">
					{#if folder.ready}
						<Icon name="folder" size={12} /> {folder.name}
					{:else}
						{folder.name} — not opened
					{/if}
				</span>
			{/if}
			<!-- Every browser, a phone included: the folder below is Chromium's,
			     and this is the way in that is not. -->
			<button title="Add pictures from this device" onclick={() => fileInput?.click()}>
				<Icon name="image-reference" size={14} /> Upload…
			</button>
			{#if available}
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
			{/if}
		</span>
	</span>

	{#if busy}
		<span class="empty">…</span>
	{:else if !images.length}
		<span class="empty">None stored</span>
	{:else}
		<!-- One picture a line: what it looks like, what it is called, how big
		     it is in pixels and in bytes, and whether anything uses it. The
		     thumbnail is also the handle it is carried onto an area by. -->
		{#if images.length >= FILTER_FROM}
			<label class="field">
				<span class="sr-only">Find a picture</span>
				<input class="w-5" type="search" placeholder="Find…" bind:value={filter} />
			</label>
		{/if}
		<ul class="images">
			{#each shown as image (image.where + image.name)}
				<li class:unused={!used.has(image.name)} title="{image.name} — {image.where === 'folder' ? 'in the folder' : 'in this browser'}, {used.has(image.name) ? 'in use' : 'unused'}">
					<span
						class="thumb"
						class:carrying={carry?.on && carry.name === image.name}
						role="button"
						tabindex="-1"
						aria-label="Drag {image.name} onto an area"
						title="Drag onto an area on the page"
						onpointerdown={(e) => startCarry(e, image.name)}
						onpointermove={moveCarry}
						onpointerup={endCarry}
						onpointercancel={endCarry}
					>
						{#if urls[image.name]}
							<img
								src={urls[image.name]}
								alt=""
								draggable="false"
								onload={(e) => {
									const img = e.currentTarget as HTMLImageElement;
									sizes = { ...sizes, [image.name]: { w: img.naturalWidth, h: img.naturalHeight } };
								}}
							/>
						{/if}
					</span>
					<span class="name">{image.name}</span>
					<span class="size">{[
						sizes[image.name] ? `${sizes[image.name].w} × ${sizes[image.name].h} px` : '',
						weigh(image.bytes)
					]
						.filter(Boolean)
						.join(' · ')}</span>
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

<input bind:this={fileInput} type="file" accept="image/*" multiple hidden onchange={upload} />

{#if carry?.on && urls[carry.name]}
	<!-- What is being carried, under the finger — on a phone the finger is
	     over the very thing it is carrying, so it sits above and to the side. -->
	<img class="ghost" src={urls[carry.name]} alt="" style="left:{carry.x}px;top:{carry.y}px" />
{/if}

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
		flex-direction: column;
		gap: 2px;
		list-style: none;
		margin: 0;
		padding: 0;
		flex: 1 1 20rem;
		min-width: 0;
		max-height: 9.5rem;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.images li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 2px 2px 2px;
		border: 1px solid transparent;
		border-radius: var(--radius-button);
	}

	.images li:hover {
		border-color: #ddd;
		background: #fff;
	}

	.images li.unused .name {
		color: #767676;
	}

	/* The grip. `touch-action: none` because a carry is a drag, and the
	   browser would otherwise take the first few pixels of it as a scroll. */
	.thumb {
		flex: none;
		display: grid;
		place-items: center;
		width: 36px;
		height: 28px;
		border: 1px solid #ddd;
		border-radius: 2px;
		background:
			repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 8px 8px;
		overflow: hidden;
		cursor: grab;
		touch-action: none;
	}

	.thumb.carrying {
		opacity: 0.4;
	}

	.thumb img {
		max-width: 100%;
		max-height: 100%;
		pointer-events: none;
	}

	.name {
		flex: 1;
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
		white-space: nowrap;
	}

	.tag {
		font: 600 9px/1 ui-sans-serif, system-ui, sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #b26a00;
	}

	.images li :global(button.square) {
		border: none;
		width: 22px;
		height: 22px;
		padding: 0;
		justify-content: center;
		color: #767676;
		background: none;
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

	.ghost {
		position: fixed;
		z-index: 60;
		width: 56px;
		height: 56px;
		object-fit: contain;
		margin: -64px 0 0 8px;
		pointer-events: none;
		border: 1px solid #2563eb;
		border-radius: 3px;
		background: #fff;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
		opacity: 0.9;
	}
</style>
