/**
 * Hand the browser a file. One copy, because the template export, the CSV
 * export and the PNG export all want it and an object URL that is never
 * revoked is a leak that only shows up after a long session.
 */
export function download(filename: string, contents: string, type = 'application/json') {
	downloadBlob(filename, new Blob([contents], { type }));
}

/**
 * The same, for bytes that are already a blob.
 *
 * The revoke is deferred by a frame rather than fired on the next line: Chrome
 * tolerates a URL revoked immediately after the click, but Safari and Firefox
 * can still be reading it, and the download is silently cancelled. Waiting a
 * frame costs nothing and is the difference between a file and no file.
 */
export function downloadBlob(filename: string, blob: Blob) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** A filename stem from a human name: lowercase, hyphens, nothing surprising. */
export const slugify = (name: string) =>
	name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
