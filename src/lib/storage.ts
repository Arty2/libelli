import type { Dataset, FontRef, Mapping, Template, UiState } from './types';

/**
 * Client-side persistence. Nothing here ever leaves the browser.
 *
 * localStorage holds the small, string-shaped settings (column mapping, UI
 * state). IndexedDB holds anything that can get big or binary — datasets,
 * templates, uploaded font bytes and background images — because localStorage
 * is ~5MB per origin,
 * string-only, and synchronous on the main thread.
 */

const PREFIX = 'libelli';
const DB_NAME = 'libelli';
const DB_VERSION = 2;

// Pre-release builds stored under the app's old name. Both are migrated once,
// on boot, so nobody loses a template to a rename.
const LEGACY_PREFIX = 'a5cs';
const LEGACY_DB_NAME = 'a5-card-studio';
export const STORE_KV = 'kv';
export const STORE_FONTS = 'fonts';
// Uploaded background images. Kept out of `kv` so a template save can never
// drag megabytes of picture along with it.
export const STORE_ASSETS = 'assets';

export const KEY_TEMPLATE = 'template:current';
export const KEY_DATASET = 'dataset:current';

/**
 * Every saved template is one record under this prefix, keyed by its id.
 *
 * Deliberately not an index record listing them: a list kept beside the
 * documents is a second copy of the same truth, and the moment a write lands in
 * one and not the other the picker is naming templates that are not there. The
 * documents are small, there are a handful of them, and `listTemplates` reads
 * the lot — which is also the repair, since a document with no index entry is
 * simply in the list.
 */
export const KEY_TEMPLATE_PREFIX = 'template:doc:';

const hasWindow = () => typeof window !== 'undefined';

export const local = {
	get<T>(key: string, fallback: T): T {
		if (!hasWindow()) return fallback;
		try {
			const raw = window.localStorage.getItem(`${PREFIX}:${key}`);
			return raw === null ? fallback : (JSON.parse(raw) as T);
		} catch {
			return fallback;
		}
	},
	set(key: string, value: unknown): void {
		if (!hasWindow()) return;
		try {
			window.localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
		} catch {
			// Quota or a private-mode browser: settings are a convenience, not a contract.
		}
	},
	remove(key: string): void {
		if (!hasWindow()) return;
		try {
			window.localStorage.removeItem(`${PREFIX}:${key}`);
		} catch {
			/* ignore */
		}
	},
	clear(): void {
		if (!hasWindow()) return;
		try {
			for (const key of Object.keys(window.localStorage)) {
				if (key.startsWith(`${PREFIX}:`)) window.localStorage.removeItem(key);
			}
		} catch {
			/* ignore */
		}
	}
};

/**
 * Mapping is keyed per template, so switching templates keeps every binding.
 *
 * By id rather than by name, because a library makes two templates called
 * "Untitled card" ordinary rather than freakish, and they would otherwise share
 * one mapping and overwrite each other's. The name is still read as a fallback:
 * mappings saved before this were keyed that way, and an *imported* template
 * carries a name and no id at all — matching it to the bindings last used under
 * that name is the one case where the name is the better key.
 */
const mappingKey = (key: string) => `mapping:${key}`;

export const loadMapping = (id: string, templateName: string): Mapping => {
	const own = local.get<Mapping>(mappingKey(id), {});
	if (Object.keys(own).length) return own;
	return local.get<Mapping>(mappingKey(templateName), {});
};
export const saveMapping = (id: string, mapping: Mapping) => local.set(mappingKey(id), mapping);

const UI_DEFAULTS: UiState = { showBounds: true, showTies: false, showGrid: false, showGuides: true, smartGuides: true, gridStyle: 'lines', columnWidths: {}, zoom: 'fit' };

// Merged, not returned raw: a settings blob written by an older build is missing
// whatever was added since, and an undefined toggle renders as neither on nor off.
// `showOutlines` is what this toggle was called before it was renamed to Bounds;
// read it once so nobody's preference is silently flipped back on by a rename.
export const loadUi = (): UiState => {
	const stored = local.get<Partial<UiState> & { showOutlines?: boolean; trayWidth?: number }>('ui', {});
	// `trayWidth` was px, in 0.16.0; the width is a share now, and a stale
	// number carried along in every save would only be something to misread.
	const { showOutlines, trayWidth: _px, ...rest } = stored;
	return { ...UI_DEFAULTS, ...(showOutlines === undefined ? {} : { showBounds: showOutlines }), ...rest };
};
export const saveUi = (ui: UiState) => local.set('ui', ui);


/**
 * The editor's own fonts: families this browser has been given — a file
 * uploaded, a Google name typed in — that no template currently carries. A
 * template keeps only the families it is set in (see `pruneFonts`); the rest
 * live here, so a face dropped from one card is still in the menu for the
 * next. Names and references only; the bytes of an upload are in IndexedDB.
 */
export const loadEditorFonts = (): FontRef[] => {
	const stored = local.get<unknown>('fonts', []);
	if (!Array.isArray(stored)) return [];
	return stored.filter(
		(f): f is FontRef =>
			!!f && typeof f.family === 'string' && ['google', 'local', 'system'].includes(f.source)
	);
};
export const saveEditorFonts = (fonts: FontRef[]) => local.set('fonts', fonts);

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
	if (!hasWindow() || !('indexedDB' in window)) return Promise.resolve(null);
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve) => {
		let request: IDBOpenDBRequest;
		try {
			request = indexedDB.open(DB_NAME, DB_VERSION);
		} catch {
			resolve(null);
			return;
		}
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
			if (!db.objectStoreNames.contains(STORE_FONTS)) db.createObjectStore(STORE_FONTS);
			if (!db.objectStoreNames.contains(STORE_ASSETS)) db.createObjectStore(STORE_ASSETS);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
	});
	return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
	return openDb().then(
		(db) =>
			new Promise<T | undefined>((resolve) => {
				if (!db) return resolve(undefined);
				try {
					const transaction = db.transaction(store, mode);
					const request = run(transaction.objectStore(store));
					request.onsuccess = () => resolve(request.result as T);
					request.onerror = () => resolve(undefined);
				} catch {
					resolve(undefined);
				}
			})
	);
}

export const idbGet = <T>(store: string, key: string) => tx<T>(store, 'readonly', (s) => s.get(key));
/** True if the write landed. A put resolves its key, so `undefined` is a failure. */
export const idbSet = (store: string, key: string, value: unknown) =>
	tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key)).then((k) => k !== undefined);
export const idbDelete = (store: string, key: string) => tx<void>(store, 'readwrite', (s) => s.delete(key));
export const idbKeys = (store: string) => tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()).then((k) => (k ?? []).map(String));

/**
 * Whether IndexedDB opened at all. Every read here resolves rather than
 * rejecting, so a blocked or private-mode browser is indistinguishable from an
 * empty one — and "no stored template" means something very different in the
 * two cases. The caller needs to be able to tell which it is looking at.
 */
export const storageAvailable = () => openDb().then((db) => db !== null);

export const saveTemplate = (t: Template) => idbSet(STORE_KV, KEY_TEMPLATE, t);
export const loadTemplate = () => idbGet<Template>(STORE_KV, KEY_TEMPLATE);
export const saveDataset = (d: Dataset) => idbSet(STORE_KV, KEY_DATASET, d);
export const loadDataset = () => idbGet<Dataset>(STORE_KV, KEY_DATASET);

// ---- the template library --------------------------------------------------

/**
 * The saved templates, as the picker needs to list them.
 *
 * `template:current` above is untouched by any of this: it is still the working
 * copy, still written on every edit, and still what boot reads first. The
 * library is a second place the same template is kept, under an id that
 * survives renaming — so somebody who has never opened the picker keeps exactly
 * the app they had, and their one template joins the library the first time
 * they do.
 */
export interface TemplateEntry {
	id: string;
	name: string;
}

/** Which of them is loaded. A short string, so localStorage rather than the database. */
export const loadTemplateId = (): string => local.get<string>('template:id', '');
export const saveTemplateId = (id: string) => local.set('template:id', id);

/**
 * Identity for a stored template, and nothing more — never shown, never used as
 * a file name. Time-ordered so the library's natural order is the order things
 * were made, with a random tail because two templates can be created in the
 * same millisecond by holding a button down.
 */
export const nextTemplateId = (): string => mintId('t');

/** The shape both libraries mint their ids in; see `nextTemplateId` for why. */
const mintId = (prefix: string): string =>
	`${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const templateDocKey = (id: string) => `${KEY_TEMPLATE_PREFIX}${id}`;

export const saveTemplateDoc = (id: string, t: Template) => idbSet(STORE_KV, templateDocKey(id), t);
export const loadTemplateDoc = (id: string) => idbGet<Template>(STORE_KV, templateDocKey(id));
export const deleteTemplateDoc = (id: string) => idbDelete(STORE_KV, templateDocKey(id));

/**
 * Every saved template, by id and name, in name order.
 *
 * Read out of the documents themselves rather than from an index kept beside
 * them — see `KEY_TEMPLATE_PREFIX`. A document that will not load at all is
 * left out rather than listed as a name that opens nothing.
 */
export async function listTemplates(): Promise<TemplateEntry[]> {
	const keys = await idbKeys(STORE_KV);
	const ids = keys
		.filter((key) => key.startsWith(KEY_TEMPLATE_PREFIX))
		.map((key) => key.slice(KEY_TEMPLATE_PREFIX.length));
	const entries: TemplateEntry[] = [];
	for (const id of ids) {
		const doc = await loadTemplateDoc(id);
		if (!doc) continue;
		const name = typeof doc.name === 'string' && doc.name.trim() ? doc.name.trim() : 'Untitled card';
		entries.push({ id, name });
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

// ---- the table library -----------------------------------------------------

/**
 * Tables are kept the way templates are, and for the same reasons: a working
 * copy under `dataset:current` that boot reads first, and a document per table
 * under an id that survives renaming. A browser that has only ever had one
 * table keeps exactly the table it had, and that table joins the library the
 * first time anything asks for the list.
 *
 * A table and a template are deliberately not paired off. The whole point of
 * this app is that one design prints any number of tables and one table can be
 * printed by any number of designs, so the two libraries are switched
 * independently and neither knows the other exists.
 */
export const KEY_DATASET_PREFIX = 'dataset:doc:';

export interface DatasetEntry {
	id: string;
	name: string;
}

/** What a table with no name of its own is called, everywhere it is listed. */
export const UNTITLED_TABLE = 'Untitled table';

export const loadDatasetId = (): string => local.get<string>('dataset:id', '');
export const saveDatasetId = (id: string) => local.set('dataset:id', id);

/**
 * The table that was open before this one — what the swap goes back to.
 *
 * Stored rather than kept in a variable: the pair you are working between is
 * the last thing you want to lose to a reload, and it is one short string.
 */
export const loadPreviousDatasetId = (): string => local.get<string>('dataset:previous', '');
export const savePreviousDatasetId = (id: string) => local.set('dataset:previous', id);

export const nextDatasetId = (): string => mintId('d');

const datasetDocKey = (id: string) => `${KEY_DATASET_PREFIX}${id}`;

export const saveDatasetDoc = (id: string, d: Dataset) => idbSet(STORE_KV, datasetDocKey(id), d);
export const loadDatasetDoc = (id: string) => idbGet<Dataset>(STORE_KV, datasetDocKey(id));
export const deleteDatasetDoc = (id: string) => idbDelete(STORE_KV, datasetDocKey(id));

/**
 * Every saved table, by id and name, in name order. Read out of the documents
 * themselves — see `KEY_TEMPLATE_PREFIX` for why there is no index beside them.
 */
export async function listDatasets(): Promise<DatasetEntry[]> {
	const keys = await idbKeys(STORE_KV);
	const ids = keys
		.filter((key) => key.startsWith(KEY_DATASET_PREFIX))
		.map((key) => key.slice(KEY_DATASET_PREFIX.length));
	const entries: DatasetEntry[] = [];
	for (const id of ids) {
		const doc = await loadDatasetDoc(id);
		if (!doc) continue;
		const name = typeof doc.name === 'string' && doc.name.trim() ? doc.name.trim() : UNTITLED_TABLE;
		entries.push({ id, name });
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Carry work saved by pre-release builds over to the current keys. Runs once
 * per browser: the old localStorage keys and the old database are removed after
 * copying, so a second run finds nothing to do.
 */
export async function migrateLegacyStorage(): Promise<void> {
	if (!hasWindow()) return;

	try {
		for (const key of Object.keys(window.localStorage)) {
			if (!key.startsWith(`${LEGACY_PREFIX}:`)) continue;
			const moved = `${PREFIX}:${key.slice(LEGACY_PREFIX.length + 1)}`;
			// Never overwrite something the current build already wrote.
			if (window.localStorage.getItem(moved) === null) {
				window.localStorage.setItem(moved, window.localStorage.getItem(key) ?? '');
			}
			window.localStorage.removeItem(key);
		}
	} catch {
		/* private mode: nothing to carry over anyway */
	}

	if (!('indexedDB' in window)) return;
	try {
		// Only touch the legacy database if it is actually there — opening a
		// missing one would create an empty database as a side effect.
		const databases = (await indexedDB.databases?.()) ?? [];
		if (!databases.some((d) => d.name === LEGACY_DB_NAME)) return;

		const legacy = await new Promise<IDBDatabase | null>((resolve) => {
			const request = indexedDB.open(LEGACY_DB_NAME);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(null);
			request.onblocked = () => resolve(null);
		});
		if (!legacy) return;

		for (const store of [STORE_KV, STORE_FONTS]) {
			if (!legacy.objectStoreNames.contains(store)) continue;
			const entries = await new Promise<Array<[string, unknown]>>((resolve) => {
				try {
					const objectStore = legacy.transaction(store, 'readonly').objectStore(store);
					const keys = objectStore.getAllKeys();
					const values = objectStore.getAll();
					values.onsuccess = () => resolve((keys.result ?? []).map((k, i) => [String(k), values.result[i]]));
					values.onerror = () => resolve([]);
				} catch {
					resolve([]);
				}
			});
			for (const [key, value] of entries) {
				if ((await idbGet(store, key)) === undefined) await idbSet(store, key, value);
			}
		}

		legacy.close();
		indexedDB.deleteDatabase(LEGACY_DB_NAME);
	} catch {
		// A failed migration must never stop the app from starting.
	}
}

/** "Reset everything": drop every trace of this app from the browser. */
export async function resetAll(): Promise<void> {
	local.clear();
	const db = await openDb();
	if (db) {
		db.close();
		dbPromise = null;
		await new Promise<void>((resolve) => {
			const request = indexedDB.deleteDatabase(DB_NAME);
			request.onsuccess = () => resolve();
			request.onerror = () => resolve();
			request.onblocked = () => resolve();
		});
	}
}
