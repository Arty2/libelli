/**
 * What a file dropped on the app is, decided from what the browser says about
 * it before a byte is read.
 *
 * The extension first and the MIME type only as a fallback: the type a
 * browser reports for a dropped file comes from the operating system, and it
 * is unreliable exactly where it matters — Windows calls a `.csv`
 * `application/vnd.ms-excel` whenever Excel is installed, and some systems
 * report nothing at all. A name is what the person chose and can see.
 *
 * It only sorts; whether the contents are any good is for the parser that
 * reads them to report (see AGENTS.md, "A parser reports; the caller decides").
 */

export type DroppedKind = 'template' | 'table' | 'image' | 'unknown';

/** Anything with the two facts a `File` carries, so tests need no DOM. */
export interface FileFacts {
	name: string;
	type: string;
}

/** What the table's own Import button accepts, so a drop takes the same files. */
const TABLE_EXTENSIONS = ['csv', 'tsv', 'txt'];
const TABLE_TYPES = ['text/csv', 'text/tab-separated-values', 'text/plain'];

function extension(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function droppedKind(file: FileFacts): DroppedKind {
	const ext = extension(file.name);
	if (ext === 'json') return 'template';
	if (TABLE_EXTENSIONS.includes(ext)) return 'table';
	// A known extension that is neither is taken at its word, whatever type
	// the system attached: a `.xlsx` reported as `text/plain` is not a CSV.
	const type = file.type.toLowerCase().split(';')[0].trim();
	if (type.startsWith('image/')) return 'image';
	if (ext) return 'unknown';
	if (type === 'application/json') return 'template';
	if (TABLE_TYPES.includes(type)) return 'table';
	return 'unknown';
}

/**
 * Whether a drag in progress could be one the app takes, from the MIME types
 * a `dragover` exposes (names are hidden until the drop). Generous on
 * purpose: an empty or odd type may still be a `.csv`, and the drop itself
 * says so if it is not. Only a drag of nothing but images is left out, since
 * those belong to the page and its areas.
 */
export function mightTakeDrag(types: readonly string[]): boolean {
	return types.length > 0 && !types.every((t) => t.toLowerCase().startsWith('image/'));
}

/** A table's name from the file it came in: the stem, dashes and underscores as spaces. */
export function tableNameFrom(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
	return stem.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}
