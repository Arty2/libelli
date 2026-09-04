import type { Dataset, Mapping, Template, UiState } from './types';

/**
 * Client-side persistence. Nothing here ever leaves the browser.
 *
 * localStorage holds the small, string-shaped settings (column mapping, UI
 * state). IndexedDB holds anything that can get big or binary — datasets,
 * templates and uploaded font bytes — because localStorage is ~5MB per origin,
 * string-only, and synchronous on the main thread.
 */

const PREFIX = 'a5cs';
const DB_NAME = 'a5-card-studio';
const DB_VERSION = 1;
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

export const loadUi = (): UiState => local.get<UiState>('ui', { showOutlines: true, zoom: 'fit' });
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
