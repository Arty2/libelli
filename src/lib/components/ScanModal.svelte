<script lang="ts">
	import { rowFromUrl, sharedRowKey, type SharedRow } from '$lib/share';

	interface Props {
		onrow: (row: SharedRow) => void;
		onclose: () => void;
	}

	let { onrow, onclose }: Props = $props();

	let video = $state<HTMLVideoElement | null>(null);
	let cameraError = $state('');
	let scanning = $state(false);
	let collected = $state<Array<{ key: string; label: string }>>([]);
	let pasted = $state('');
	let notice = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);

	// Holding a card in frame decodes the same code thirty times a second; the
	// keys we have already taken are what stop that becoming thirty rows.
	const seen = new Set<string>();
	let stream: MediaStream | null = null;
	let frame = 0;

	const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');

	/**
	 * The decoder is the app's one runtime dependency and nothing else needs it,
	 * so it is fetched when scanning starts rather than shipped to everyone who
	 * only ever prints cards.
	 */
	let decode: typeof import('jsqr').default | null = null;
	let loading = $state(false);

	async function loadDecoder() {
		if (decode) return decode;
		loading = true;
		try {
			decode = (await import('jsqr')).default;
			return decode;
		} finally {
			loading = false;
		}
	}

	function take(text: string, source: string): boolean {
		const shared = rowFromUrl(text);
		if (!shared) {
			notice = `That code is not a row link: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`;
			return false;
		}
		const key = sharedRowKey(shared);
		if (seen.has(key)) {
			notice = 'Already collected that one.';
			return false;
		}
		seen.add(key);
		collected = [...collected, { key, label: shared.values.find((v) => v.trim()) || '(empty row)' }];
		notice = `Added from ${source}.`;
		onrow(shared);
		return true;
	}

	function readImage(source: CanvasImageSource, width: number, height: number): string | null {
		if (!canvas || !decode || !width || !height) return null;
		// Decode at a bounded size: a 4K frame costs far more to scan than it
		// gains, and phones hand over exactly that.
		const scale = Math.min(1, 800 / Math.max(width, height));
		canvas.width = Math.round(width * scale);
		canvas.height = Math.round(height * scale);
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		context.drawImage(source, 0, 0, canvas.width, canvas.height);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
		return decode(pixels.data, pixels.width, pixels.height)?.data ?? null;
	}

	async function startCamera() {
		cameraError = '';
		await loadDecoder();
		if (!navigator.mediaDevices?.getUserMedia) {
			cameraError = 'This browser has no camera access here. Paste a link or choose an image instead.';
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
		} catch (error) {
			cameraError =
				error instanceof DOMException && error.name === 'NotAllowedError'
					? 'Camera permission was refused. Paste a link or choose an image instead.'
					: 'No camera available. Paste a link or choose an image instead.';
			return;
		}
		if (!video) return;
		video.srcObject = stream;
		await video.play().catch(() => {});
		scanning = true;
		tick();
	}

	function tick() {
		if (!scanning || !video) return;
		if (video.readyState === video.HAVE_ENOUGH_DATA) {
			const text = readImage(video, video.videoWidth, video.videoHeight);
			if (text) take(text, 'the camera');
		}
		frame = requestAnimationFrame(tick);
	}

	function stopCamera() {
		scanning = false;
		cancelAnimationFrame(frame);
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	async function readFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			await loadDecoder();
			const bitmap = await createImageBitmap(file);
			const text = readImage(bitmap, bitmap.width, bitmap.height);
			bitmap.close();
			if (text) take(text, 'the image');
			else notice = 'No QR code found in that image.';
		} catch {
			notice = 'That file could not be read as an image.';
		}
	}

	function submitPasted() {
		if (!pasted.trim()) return;
		if (take(pasted.trim(), 'the pasted link')) pasted = '';
	}

	$effect(() => {
		void startCamera();
		return stopCamera;
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="scan-title">
	<h2 id="scan-title">Scan rows in</h2>

	<div class="viewer">
		{#if loading && !cameraError}
			<p class="camera-error">Loading the decoder…</p>
		{:else if cameraError}
			<p class="camera-error">{cameraError}</p>
		{:else}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} playsinline muted></video>
		{/if}
	</div>

	<p class="muted">
		Point the camera at a card's QR. Codes carrying a row are added to the table; anything else is left alone.
		Nothing is uploaded — the decoding happens here.
	</p>

	<div class="fallbacks">
		<input
			bind:value={pasted}
			placeholder="…or paste a link"
			aria-label="Paste a row link"
			onkeydown={(e) => e.key === 'Enter' && submitPasted()}
		/>
		<button onclick={submitPasted}>Add</button>
		<button onclick={() => fileInput?.click()}>Choose an image…</button>
		<input bind:this={fileInput} type="file" accept="image/*" hidden onchange={readFile} />
	</div>

	{#if notice}<p class="notice" role="status">{notice}</p>{/if}

	{#if collected.length}
		<ol class="collected">
			{#each collected as item (item.key)}
				<li>{item.label}</li>
			{/each}
		</ol>
	{/if}

	<div class="actions">
		<span class="count">{collected.length} collected</span>
		<span class="spacer"></span>
		<button class="primary" onclick={onclose}>Done</button>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 60;
	}

	.modal {
		position: fixed;
		z-index: 61;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(460px, 94vw);
		max-height: 90vh;
		overflow: auto;
		background: #fff;
		border-radius: 10px;
		padding: 18px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
		font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
	}

	h2 {
		margin: 0 0 10px;
		font-size: 15px;
	}

	.viewer {
		background: #111;
		border-radius: 8px;
		overflow: hidden;
		aspect-ratio: 4 / 3;
		display: grid;
		place-items: center;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.camera-error {
		color: #eee;
		margin: 0;
		padding: 18px;
		text-align: center;
		font-size: 12px;
	}

	.muted {
		color: #767676;
		font-size: 11.5px;
		margin: 8px 0;
	}

	.fallbacks {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.fallbacks input {
		flex: 1;
		min-width: 10rem;
	}

	input,
	button {
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 6px 9px;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
	}

	input {
		cursor: text;
	}

	button.primary {
		background: #111;
		border-color: #111;
		color: #fff;
	}

	.notice {
		margin: 8px 0 0;
		font-size: 11.5px;
		color: #555;
	}

	.collected {
		margin: 8px 0 0;
		padding-left: 20px;
		max-height: 8rem;
		overflow: auto;
		font-size: 12px;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 14px;
	}

	.count {
		color: #767676;
		font-size: 11.5px;
	}

	.spacer {
		flex: 1;
	}
</style>
