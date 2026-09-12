import type { Dataset, Row } from './types';

/**
 * Delimiter-separated parsing for spreadsheet paste (TSV) and CSV files.
 * Handles quoted fields, embedded delimiters, embedded newlines and doubled
 * quotes ("" -> "). Everything a cell of Markdown pasted out of Excel throws at it.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
	const rows: string[][] = [];
	let field = '';
	let row: string[] = [];
	let inQuotes = false;
	let i = 0;

	// Strip a UTF-8 BOM; Excel loves adding one.
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		pushField();
		rows.push(row);
		row = [];
	};

	while (i < text.length) {
		const ch = text[i];

		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}

		if (ch === '"' && field === '') {
			inQuotes = true;
			i++;
			continue;
		}
		if (ch === delimiter) {
			pushField();
			i++;
			continue;
		}
		if (ch === '\r') {
			// \r\n and a lone \r both end the record.
			if (text[i + 1] === '\n') i++;
			pushRow();
			i++;
			continue;
		}
		if (ch === '\n') {
			pushRow();
			i++;
			continue;
		}
		field += ch;
		i++;
	}

	// Trailing field/row, unless the text ended exactly on a newline.
	if (field !== '' || row.length > 0) pushRow();

	// Drop a trailing all-empty record left by a final newline.
	while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();

	return rows;
}

/** Guess the delimiter by counting occurrences outside quotes on the first line. */
export function sniffDelimiter(text: string): string {
	const candidates = ['\t', ',', ';'];
	let best = ',';
	let bestCount = 0;
	for (const d of candidates) {
		const rows = parseDelimited(text.slice(0, 20000), d);
		const count = rows[0]?.length ?? 0;
		if (count > bestCount) {
			bestCount = count;
			best = d;
		}
	}
	return best;
}

/** Make headers non-empty and unique so they can safely key a row object. */
export function normaliseHeaders(raw: string[]): string[] {
	const seen = new Map<string, number>();
	return raw.map((h, idx) => {
		const base = h.trim() || `Column ${idx + 1}`;
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		return n === 0 ? base : `${base} (${n + 1})`;
	});
}

export interface ParseOptions {
	delimiter?: string;
	/** when false, synthesise Column 1..N headers and keep every record as data */
	header?: boolean;
}

export function parseTable(text: string, options: ParseOptions = {}): Dataset {
	const delimiter = options.delimiter ?? sniffDelimiter(text);
	const grid = parseDelimited(text, delimiter);
	if (grid.length === 0) return { columns: [], rows: [] };

	const useHeader = options.header ?? true;
	const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
	const columns = useHeader
		? normaliseHeaders(pad(grid[0], width))
		: Array.from({ length: width }, (_, i) => `Column ${i + 1}`);

	const body = useHeader ? grid.slice(1) : grid;
	const rows: Row[] = body.map((cells) => {
		const row: Row = {};
		const padded = pad(cells, width);
		columns.forEach((c, i) => (row[c] = padded[i] ?? ''));
		return row;
	});

	return { columns, rows };
}

function pad(cells: string[], width: number): string[] {
	if (cells.length >= width) return cells;
	return [...cells, ...Array<string>(width - cells.length).fill('')];
}

/**
 * Serialise back out, for "export CSV" round-trips and for the clipboard.
 *
 * A field is quoted only when it holds something that would otherwise break
 * the record — the delimiter, a quote, or a line ending — which is what every
 * spreadsheet writes and what `parseDelimited` above reads back. CRLF between
 * records, because that is what a spreadsheet puts on the clipboard and what
 * Excel wants to find there.
 */
function serialise(dataset: Dataset, delimiter: string): string {
	const esc = (v: string) =>
		v.includes(delimiter) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
	const lines = [dataset.columns.map(esc).join(delimiter)];
	for (const row of dataset.rows) {
		lines.push(dataset.columns.map((c) => esc(row[c] ?? '')).join(delimiter));
	}
	return lines.join('\r\n');
}

export const toCsv = (dataset: Dataset): string => serialise(dataset, ',');

/**
 * The table as tab-separated text: what a spreadsheet puts on the clipboard,
 * and what it reads back off one. Tabs rather than commas because a paste into
 * Excel or Sheets lands in cells straight away — a comma-separated paste
 * arrives as one column per row and needs a text-import dialog to undo.
 */
export const toTsv = (dataset: Dataset): string => serialise(dataset, '\t');
