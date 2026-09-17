import { STORE_ASSETS, idbDelete, idbGet, idbKeys, idbSet } from './storage';
import type { PageBackgroundImage } from './types';

/**
 * Background images.
 *
 * The template never carries the picture — only a file name or a URL — so a
 * template stays small enough to paste into a message. An uploaded file's bytes
 * live in this browser's IndexedDB instead, exactly like an uploaded font, and
 * a template that names an image this browser has never seen asks for the file
 * by name rather than quietly rendering a blank page.
 */

export interface StoredImage {
	name: string;
	type: string;
	bytes: ArrayBuffer;
}

const assetKey = (name: string) => `image:${name.trim().toLowerCase()}`;

/**
 * Object URLs are handed to the browser, not garbage-collected with the value
 * that made them, so each one is kept until it is replaced and then revoked.
 * Without this, re-picking an image a few times leaks a copy each time.
 */
const objectUrls = new Map<string, string>();

function cacheObjectUrl(key: string, blob: Blob): string {
	const previous = objectUrls.get(key);
	if (previous) URL.revokeObjectURL(previous);
	const url = URL.createObjectURL(blob);
	objectUrls.set(key, url);
	return url;
}

/**
 * Only http(s) is allowed through. A `data:` URL would defeat the point by
 * living inside the template file, and everything else — `javascript:` above
 * all — has no business in a `background-image`.
 */
export function safeImageUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const value = raw.trim();
	if (!value) return null;
	try {
		// Parsed *without* a base, so a relative address cannot become an
		// absolute one. It used to be resolved against the app's own location,
		// which meant any words at all in an image area — `The table below` —
		// came out as a URL pointing back at this app, and the browser went and
		// asked for it. The app fetches nothing: an address has to say so itself.
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
	} catch {
		return null;
	}
}

/**
 * What may reach an `<img src>` or a `background-image` on a card.
 *
 * Wider than `safeImageUrl` by exactly one scheme: a base64 `data:` URL naming
 * an image type. A template may carry one inline, and an area bound to a column
 * may be handed one in a cell — and a cell is untrusted, so the shape is
 * checked rather than the prefix alone. An SVG is allowed because an `<img>` is
 * an inert context for one: no script in it runs, and nothing in it can reach
 * the page around it.
 */
const DATA_IMAGE = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i;

export function safeMediaUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const value = raw.trim();
	if (!value) return null;
	if (DATA_IMAGE.test(value)) return value;
	return safeImageUrl(value);
}

/** A URL as it can be written inside a `url("…")`, quotes and all. */
export const cssUrl = (src: string) => `url("${src.replace(/["\\]/g, '\\$&')}")`;

/**
 * Store an uploaded file and return the reference the template will carry.
 * `nameOverride` is for supplying the bytes of an image a template already
 * names: the file you pick may be called anything, but the reference has to
 * stay the one the template was written with.
 */
export async function uploadBackgroundImage(
	file: File,
	fit: PageBackgroundImage['fit'] = 'cover',
	nameOverride?: string
): Promise<PageBackgroundImage> {
	const name = (nameOverride ?? file.name).trim() || 'background';
	await writeImage(name, file);
	return { src: name, source: 'local', fit };
}

/**
 * Put an image's bytes wherever this browser is keeping them: the chosen folder
 * if there is one, and IndexedDB otherwise. One path for every kind of picture —
 * a page background, a sheet background and a row's own are all just an image
 * under a name, and having two of these would mean one of them was wrong.
 */
async function writeImage(name: string, file: File): Promise<void> {
	const folder = await readyFolder();
	if (folder) {
		const handle = await folder.getFileHandle(name, { create: true });
		const writable = await handle.createWritable();
		await writable.write(file);
		await writable.close();
		// A name held in both places would resolve to whichever was looked at
		// first. The folder is looked at first, so the other copy is dead weight.
		await idbDelete(STORE_ASSETS, assetKey(name));
		return;
	}
	await idbSet(STORE_ASSETS, assetKey(name), {
		name,
		type: file.type || 'image/png',
		bytes: await file.arrayBuffer()
	} satisfies StoredImage);
}

/**
 * Turn a template's background reference into something a `background-image`
 * can use, or null when it cannot be resolved here — a local file this browser
 * does not have, which the caller surfaces as a prompt for the file.
 */
export async function resolveBackground(image: PageBackgroundImage | undefined): Promise<string | null> {
	if (!image?.src) return null;
	if (image.source === 'url') return safeImageUrl(image.src);
	if (typeof window === 'undefined') return null;
	const key = assetKey(image.src);
	// The folder first, then this browser — the same order a row's image is
	// looked for in, for the same reason.
	const folder = await readyFolder();
	const file = folder ? await fileIn(folder, image.src) : null;
	if (file) return cacheObjectUrl(key, file);
	const stored = await idbGet<StoredImage>(STORE_ASSETS, key);
	if (!stored?.bytes) return null;
	return cacheObjectUrl(key, new Blob([stored.bytes], { type: stored.type || 'image/png' }));
}

// ---- images a row carries ---------------------------------------------------

/**
 * How a cell names an image that lives in this browser: `local:sketch.png`.
 *
 * Not `file:`, which it would be easy to reach for and which would be a lie: a
 * page served over http cannot read a file:// address — the browser refuses
 * outright, and no setting changes that. What a cell can carry is a *name*, and
 * the bytes under that name are in IndexedDB beside the fonts and the
 * backgrounds. It is the same bargain a template already makes for its
 * background image, written as a string because a cell is a string.
 *
 * A prefix rather than a bare file name, because a bare one is indistinguishable
 * from a relative URL — and a relative URL resolves against the app's own
 * address and would be fetched off the network.
 */
export const LOCAL_IMAGE = 'local:';

/** The name in a `local:` reference, or null for anything else. */
export function localImageName(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const value = raw.trim();
	if (!value.toLowerCase().startsWith(LOCAL_IMAGE)) return null;
	const name = value.slice(LOCAL_IMAGE.length).trim();
	return name || null;
}

/** What a cell has to say to point at a stored image of this name. */
export const localImageRef = (name: string) => `${LOCAL_IMAGE}${name.trim()}`;

/**
 * Store a file and answer with the name a cell should carry. Shares its
 * store — and so its names — with background images: an image is an image, and
 * one uploaded as a background can be put in a row without uploading it twice.
 *
 * Into the chosen folder where there is one, and into this browser otherwise.
 * See `imageFolder` below for why that choice exists.
 */
export async function storeLocalImage(file: File): Promise<string> {
	const name = file.name.trim() || 'image';
	await writeImage(name, file);
	return name;
}

/**
 * Object URLs for every stored image named here, and the names this browser
 * has never seen. Resolved in one pass because the alternative is a read per
 * card per render; `cacheObjectUrl` then keeps one URL per name however many
 * rows point at it.
 */
export async function resolveLocalImages(
	names: Iterable<string>
): Promise<{ urls: Record<string, string>; missing: string[] }> {
	const urls: Record<string, string> = {};
	const missing: string[] = [];
	if (typeof window === 'undefined') return { urls, missing };
	const folder = await readyFolder();
	for (const name of new Set(names)) {
		const key = assetKey(name);
		// The folder first, then this browser: a run made before a folder was
		// chosen keeps rendering, and an image put in the folder afterwards is
		// what a name means from then on.
		const fromFolder = folder ? await fileIn(folder, name) : null;
		if (fromFolder) {
			urls[name] = cacheObjectUrl(key, fromFolder);
			continue;
		}
		const stored = await idbGet<StoredImage>(STORE_ASSETS, key);
		if (stored?.bytes) urls[name] = cacheObjectUrl(key, new Blob([stored.bytes], { type: stored.type || 'image/png' }));
		else missing.push(name);
	}
	return { urls, missing };
}

// ---- a folder of one's own --------------------------------------------------

/**
 * Where a run of pictures can live instead of in this browser.
 *
 * Browser storage is a bucket the browser may empty, shared with everything
 * else this origin keeps, and invisible: a zine with forty photographs in it is
 * forty photographs nobody can see, back up, or tidy. A folder chosen here is
 * an ordinary folder — the files are the files, they can be replaced from a
 * photo editor, and clearing them out is what a file manager is for.
 *
 * The File System Access API is Chromium's: Chrome, Edge, Opera and Arc have
 * it, Firefox and Safari do not. Where it is missing the app keeps every byte
 * in IndexedDB exactly as before, which is why this is an offer rather than a
 * requirement — and the panel says which of the two is in force.
 */
const FOLDER_KEY = 'folder:images';

/**
 * The part of the API this uses. Declared here because the DOM lib's version of
 * it is still moving, and `queryPermission` is an extension that has never been
 * in it: a handle kept across a restart comes back needing to be asked for
 * again, which is the whole permission dance below.
 */
interface PickedFolder extends FileSystemDirectoryHandle {
	queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
	requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
	values?(): AsyncIterableIterator<FileSystemHandle>;
}

type Picker = (options?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<PickedFolder>;

const picker = (): Picker | null =>
	typeof window === 'undefined'
		? null
		: ((window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker ?? null);

/** Whether this browser can offer a folder at all. */
export const folderAvailable = () => picker() !== null;

const storedFolder = () => idbGet<PickedFolder>(STORE_ASSETS, FOLDER_KEY);

/** The chosen folder, but only when it will actually answer. */
async function readyFolder(): Promise<PickedFolder | null> {
	const handle = await storedFolder();
	if (!handle) return null;
	const state = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
	return state === 'granted' ? handle : null;
}

async function fileIn(folder: PickedFolder, name: string): Promise<File | null> {
	try {
		return await (await folder.getFileHandle(name)).getFile();
	} catch {
		// Not in there. Every other failure looks the same from here, and the
		// answer is the same too: fall back to what this browser is holding.
		return null;
	}
}

/** A root directory has no name of its own, and "goes into ." is not a sentence. */
const folderName = (handle: PickedFolder) => handle.name || 'the folder you chose';

export interface FolderState {
	name: string;
	/** false when the browser will want to be asked again — a restart does this */
	ready: boolean;
}

/** The folder this browser remembers, and whether it is currently open to us. */
export async function imageFolder(): Promise<FolderState | null> {
	const handle = await storedFolder();
	if (!handle) return null;
	const state = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
	return { name: folderName(handle), ready: state === 'granted' };
}

/**
 * Ask for a folder. Must be called from a press: a browser will not open the
 * picker, or grant a permission, on the app's own initiative.
 */
export async function chooseImageFolder(): Promise<FolderState | null> {
	const open = picker();
	if (!open) return null;
	try {
		const handle = await open({ mode: 'readwrite', id: 'libelli-images' });
		const state = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
		if (state !== 'granted') return null;
		await idbSet(STORE_ASSETS, FOLDER_KEY, handle);
		return { name: folderName(handle), ready: true };
	} catch {
		// The picker was dismissed, which is not a failure.
		return null;
	}
}

/** Ask again for the folder this browser already remembers. Also a press. */
export async function reopenImageFolder(): Promise<FolderState | null> {
	const handle = await storedFolder();
	if (!handle) return null;
	const state = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
	return { name: folderName(handle), ready: state === 'granted' };
}

/** Let go of the folder. The files stay where they are; this app stops reading them. */
export async function forgetImageFolder(): Promise<void> {
	await idbDelete(STORE_ASSETS, FOLDER_KEY);
}

// ---- what is stored, and getting rid of it ---------------------------------

export type ImageWhere = 'folder' | 'browser';

export interface ImageRecord {
	name: string;
	bytes: number;
	where: ImageWhere;
}

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/**
 * Every image this app can see, with what it weighs.
 *
 * The folder is listed by extension rather than wholesale: it is an ordinary
 * folder that may hold anything, and a panel offering to delete a file this app
 * never wrote would be a trap.
 */
export async function listImages(): Promise<ImageRecord[]> {
	const out: ImageRecord[] = [];
	const folder = await readyFolder();
	if (folder?.values) {
		for await (const entry of folder.values()) {
			if (entry.kind !== 'file' || !IMAGE_FILE.test(entry.name)) continue;
			const file = await (entry as FileSystemFileHandle).getFile();
			out.push({ name: file.name, bytes: file.size, where: 'folder' });
		}
	}
	const seen = new Set(out.map((i) => i.name.toLowerCase()));
	for (const key of await idbKeys(STORE_ASSETS)) {
		if (!key.startsWith('image:')) continue;
		const stored = await idbGet<StoredImage>(STORE_ASSETS, key);
		if (!stored?.bytes || seen.has(stored.name.toLowerCase())) continue;
		out.push({ name: stored.name, bytes: stored.bytes.byteLength, where: 'browser' });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Delete one image, wherever it is being held. */
export async function deleteImage(name: string, where: ImageWhere): Promise<void> {
	const key = assetKey(name);
	const url = objectUrls.get(key);
	if (url) {
		URL.revokeObjectURL(url);
		objectUrls.delete(key);
	}
	if (where === 'browser') {
		await idbDelete(STORE_ASSETS, key);
		return;
	}
	const folder = await readyFolder();
	await folder?.removeEntry(name);
}

/** The CSS a resolved background turns into. The only place that mapping lives. */
export function backgroundStyle(image: PageBackgroundImage | undefined, resolved: string | null): string[] {
	if (!image || !resolved) return [];
	const parts = [`background-image:${cssUrl(resolved)}`, 'background-position:center'];
	if (image.fit === 'repeat') parts.push('background-repeat:repeat', 'background-size:auto');
	else parts.push('background-repeat:no-repeat', `background-size:${image.fit}`);
	return parts;
}
