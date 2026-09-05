import type { Dataset, Mapping, Template, UiState } from './types';

/**
 * Client-side persistence. Nothing here ever leaves the browser.
 *
 * localStorage holds the small, string-shaped settings (column mapping, UI
 * state). IndexedDB holds anything that can get big or binary — datasets,
 * templates and uploaded font bytes — because localStorage is ~5MB per origin,
 * string-only, and synchronous on the main thread.
 */

const PREFIX = 'libelli';
const DB_NAME = 'libelli';
const DB_VERSION = 1;

// Pre-release builds stored under the app's old name. Both are migrated once,
// on boot, so nobody loses a template to a rename.
const LEGACY_PREFIX = 'a5cs';
const LEGACY_DB_NAME = 'a5-card-studio';
export const STORE_KV = 'kv';
export const STORE_FONTS = 'fonts';

export const KEY_TEMPLATE = 'template:current';
export const KEY_DATASET = 'dataset:current';

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

/** Mapping is keyed by template name so switching templates keeps both bindings. */
const mappingKey = (templateName: string) => `mapping:${templateName}`;

export const loadMapping = (templateName: string): Mapping => local.get<Mapping>(mappingKey(templateName), {});
export const saveMapping = (templateName: string, mapping: Mapping) => local.set(mappingKey(templateName), mapping);

const UI_DEFAULTS: UiState = { showOutlines: true, showGrid: false, zoom: 'fit', printHintSeen: false };

// Merged, not returned raw: a settings blob written by an older build is missing
// whatever was added since, and an undefined toggle renders as neither on nor off.
export const loadUi = (): UiState => ({ ...UI_DEFAULTS, ...local.get<Partial<UiState>>('ui', {}) });
export const saveUi = (ui: UiState) => local.set('ui', ui);

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
export const idbSet = (store: string, key: string, value: unknown) => tx<void>(store, 'readwrite', (s) => s.put(value, key));
export const idbDelete = (store: string, key: string) => tx<void>(store, 'readwrite', (s) => s.delete(key));
export const idbKeys = (store: string) => tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()).then((k) => (k ?? []).map(String));

export const saveTemplate = (t: Template) => idbSet(STORE_KV, KEY_TEMPLATE, t);
export const loadTemplate = () => idbGet<Template>(STORE_KV, KEY_TEMPLATE);
export const saveDataset = (d: Dataset) => idbSet(STORE_KV, KEY_DATASET, d);
export const loadDataset = () => idbGet<Dataset>(STORE_KV, KEY_DATASET);

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
