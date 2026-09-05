import type { Dataset, Row } from './types';

/**
 * A row in a URL, both directions.
 *
 * Two shapes, both accepted on the way in:
 *
 * - **readable** — `?title=Ferns&body=…`, plain GET variables named after the
 *   columns. Anyone can write one by hand or read one off a screen.
 * - **compact** — `?r=0<base64url>` over `{c: columns, v: values}` JSON, for
 *   when the readable form would make a QR too dense to print at a sensible
 *   size. The leading marker names the encoding, so a future compressed form
 *   can be added without breaking the codes already printed.
 *
 * Everything read back is untrusted — a QR can say anything — so payloads are
 * capped, values are coerced to strings and control characters are stripped
 * before any of it reaches the table.
 */

export interface SharedRow {
	columns: string[];
	values: string[];
}

export type ShareForm = 'auto' | 'readable' | 'compact';

/** Past this the readable form makes a QR denser than it is worth printing. */
export const READABLE_LIMIT = 900;

export const MAX_PAYLOAD = 12_000;
export const MAX_COLUMNS = 64;
export const MAX_VALUE = 4_000;

const COMPACT_PARAM = 'r';
const MARKER_PLAIN = '0';

/** Keep tabs and newlines — spreadsheet cells are full of both — and drop the rest. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (text: string) => text.replace(CONTROL, '');

export function toSharedRow(row: Row, columns: string[], pick?: string[]): SharedRow {
	const chosen = (pick?.length ? columns.filter((c) => pick.includes(c)) : columns).slice(0, MAX_COLUMNS);
	return {
		columns: chosen.map((c) => clean(c).slice(0, 100)),
		values: chosen.map((c) => clean(String(row[c] ?? '')).slice(0, MAX_VALUE))
	};
}

// ---- compact form ----------------------------------------------------------

const toBase64Url = (bytes: Uint8Array) => {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string) => {
	const padded = text.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
};

export function encodeCompact(shared: SharedRow): string {
	const json = JSON.stringify({ c: shared.columns, v: shared.values });
	return MARKER_PLAIN + toBase64Url(new TextEncoder().encode(json));
}

export function decodeCompact(param: string): SharedRow | null {
	if (!param || param.length > MAX_PAYLOAD) return null;
	const marker = param[0];
	if (marker !== MARKER_PLAIN) return null;
	try {
		const json = new TextDecoder().decode(fromBase64Url(param.slice(1)));
		return normalise(JSON.parse(json));
	} catch {
		return null;
	}
}

/** Anything at all could arrive here; only a well-shaped row survives. */
function normalise(raw: unknown): SharedRow | null {
	if (!raw || typeof raw !== 'object') return null;
	const { c, v } = raw as { c?: unknown; v?: unknown };
	if (!Array.isArray(c) || !Array.isArray(v)) return null;
	const columns: string[] = [];
	const values: string[] = [];
	for (let i = 0; i < Math.min(c.length, MAX_COLUMNS); i++) {
		const name = clean(String(c[i] ?? '')).trim().slice(0, 100) || `Column ${i + 1}`;
		if (columns.includes(name)) continue;
		columns.push(name);
		values.push(clean(String(v[i] ?? '')).slice(0, MAX_VALUE));
	}
	return columns.length ? { columns, values } : null;
}

// ---- readable form ---------------------------------------------------------

export function toSearchParams(shared: SharedRow): URLSearchParams {
	const params = new URLSearchParams();
	shared.columns.forEach((column, i) => params.set(column, shared.values[i] ?? ''));
	return params;
}

export function fromSearchParams(params: URLSearchParams): SharedRow | null {
	const compact = params.get(COMPACT_PARAM);
	if (compact) return decodeCompact(compact);
	const columns: string[] = [];
	const values: string[] = [];
	for (const [key, value] of params) {
		const name = clean(key).trim().slice(0, 100);
		if (!name || columns.includes(name) || columns.length >= MAX_COLUMNS) continue;
		columns.push(name);
		values.push(clean(value).slice(0, MAX_VALUE));
	}
	// A row of nothing but empty cells is not a row worth adding.
	return columns.length && values.some((v) => v !== '') ? { columns, values } : null;
}

// ---- URLs ------------------------------------------------------------------

/**
 * `auto` keeps the link readable while it is short enough to stay a printable
 * QR, and switches to the compact form rather than producing a code nobody can
 * scan.
 */
export function rowUrl(base: string, shared: SharedRow, form: ShareForm = 'auto'): string {
	const readable = `${base}?${toSearchParams(shared)}`;
	if (form === 'readable') return readable;
	if (form === 'auto' && readable.length <= READABLE_LIMIT) return readable;
	return `${base}?${COMPACT_PARAM}=${encodeCompact(shared)}`;
}

/**
 * Read a row out of a whole URL, a bare query string, or an `r=` payload on its
 * own. A URL with no query carries no row — without that check every scanned
 * link would arrive as a single column named after itself.
 */
export function rowFromUrl(url: string): SharedRow | null {
	if (!url || url.length > MAX_PAYLOAD) return null;
	let query: string;
	if (url.includes('?')) query = url.slice(url.indexOf('?') + 1);
	else if (/^[^/#?]+=/.test(url)) query = url;
	else return null;
	try {
		return fromSearchParams(new URLSearchParams(query.split('#')[0]));
	} catch {
		return null;
	}
}

// ---- merging back into a table ---------------------------------------------

/**
 * Append a scanned row, aligning it on column names and *adding* any column the
 * table has not seen. Dropping unknown fields would quietly lose the half of a
 * card the reader could not have known about.
 */
export function appendSharedRow(dataset: Dataset, shared: SharedRow): Dataset {
	const columns = [...dataset.columns];
	for (const column of shared.columns) if (!columns.includes(column)) columns.push(column);

	const row: Row = Object.fromEntries(columns.map((c) => [c, '']));
	shared.columns.forEach((column, i) => (row[column] = shared.values[i] ?? ''));

	const rows = dataset.rows.map((existing) => {
		const filled: Row = {};
		for (const column of columns) filled[column] = existing[column] ?? '';
		return filled;
	});

	return { columns, rows: [...rows, row] };
}

/** A stable key for "have I already scanned this one?", cheap and good enough. */
export function sharedRowKey(shared: SharedRow): string {
	return shared.columns.map((c, i) => `${c}\u0000${shared.values[i] ?? ''}`).join('\u0001');
}
