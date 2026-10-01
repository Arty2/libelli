<script lang="ts">
	/**
	 * The template's own stylesheet, edited.
	 *
	 * Three layers on one grid: a gutter of line numbers, a `<pre>` holding the
	 * coloured text, and the textarea itself on top with transparent text and a
	 * visible caret. The textarea is the only thing that scrolls; the other two
	 * are moved to match. It is the standard shape for this, and the reason for
	 * it is that nothing replaces a real textarea — the caret, selection,
	 * autocomplete, an IME and every accessibility affordance are the browser's,
	 * and a `contenteditable` would have to reimplement all of them.
	 *
	 * What it costs: the three layers have to agree on every metric. Font,
	 * line-height, padding and `tab-size` are set once on the wrapper and
	 * inherited, and none of the three may wrap — hence `white-space: pre` and a
	 * horizontal scroll, without which a long line would put the numbers out of
	 * step with the text they count.
	 */
	import { highlightCss, newlineEdit, tabEdit, braceEdit, type Edit } from '$lib/csscode';

	let {
		value = $bindable(''),
		placeholder = '',
		readonly = false,
		onapply
	}: {
		value: string;
		placeholder?: string;
		/** A locked template can be read but not written — see PageOptions. */
		readonly?: boolean;
		/** Ctrl/Cmd + Enter, which the dialog answers by applying the sheet. */
		onapply?: () => void;
	} = $props();

	let field = $state<HTMLTextAreaElement | null>(null);
	let view = $state<HTMLPreElement | null>(null);
	let gutter = $state<HTMLDivElement | null>(null);

	const lines = $derived(highlightCss(value));

	/**
	 * The dialog has nothing else to focus, and a dialog that opens with the
	 * focus behind it is one Escape does not reach. Mounted only while it is
	 * open, so mounting is opening — a locked template focuses a readonly field,
	 * which is what lets the arrows scroll it.
	 */
	$effect(() => {
		const el = field;
		if (!el) return;
		el.focus();
		// At the top, not at the end. A frame later because the binding writes the
		// field's value after this effect runs, and writing a textarea's value
		// puts the caret at its end and scrolls there — so a long sheet opened at
		// its last line, which is not where anybody starts reading.
		const frame = requestAnimationFrame(() => {
			el.setSelectionRange(0, 0);
			el.scrollTop = 0;
			sync();
		});
		return () => cancelAnimationFrame(frame);
	});

	/** Put text in at the caret, replacing whatever is selected. */
	export function insert(text: string) {
		const el = field;
		if (!el) return;
		apply({ start: el.selectionStart, end: el.selectionEnd, text, selStart: el.selectionStart + text.length, selEnd: el.selectionStart + text.length });
		el.focus();
	}

	/**
	 * Write an edit into the field.
	 *
	 * Through `execCommand`, which is the one way to change a textarea's text and
	 * keep the browser's own undo stack: setting `value` or calling
	 * `setRangeText` clears it, so Ctrl/Cmd + Z after a Tab would throw away
	 * everything typed before it. It is a deprecated call kept alive by exactly
	 * this use, and the fallback is the supported one — a browser that drops it
	 * still types, it just forgets.
	 */
	function apply(edit: Edit) {
		const el = field;
		if (!el) return;
		el.focus();
		el.setSelectionRange(edit.start, edit.end);
		let done: boolean;
		try {
			done = edit.text === '' ? document.execCommand('delete') : document.execCommand('insertText', false, edit.text);
		} catch {
			done = false;
		}
		if (!done) el.setRangeText(edit.text, edit.start, edit.end, 'end');
		el.setSelectionRange(edit.selStart, edit.selEnd);
		value = el.value;
		sync();
	}

	/** The two passive layers follow the one that scrolls. */
	function sync() {
		if (!field) return;
		if (view) {
			view.scrollTop = field.scrollTop;
			view.scrollLeft = field.scrollLeft;
		}
		if (gutter) gutter.scrollTop = field.scrollTop;
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			onapply?.();
			return;
		}
		// Tab moves the focus out of a field nobody can type in, which is what it
		// should do there.
		if (readonly) return;
		const el = event.currentTarget as HTMLTextAreaElement;
		const { value: text, selectionStart: start, selectionEnd: end } = el;
		if (event.key === 'Tab') {
			event.preventDefault();
			apply(tabEdit(text, start, end, event.shiftKey));
			return;
		}
		// An IME's Enter is committing a candidate, not a new line.
		if (event.key === 'Enter' && !event.isComposing) {
			event.preventDefault();
			apply(newlineEdit(text, start, end));
			return;
		}
		if (event.key === '}') {
			const edit = braceEdit(text, start, end);
			if (edit) {
				event.preventDefault();
				apply(edit);
			}
		}
	}
</script>

<div class="editor" class:readonly>
	<!-- Counted from the coloured lines rather than from `value.split`, so the
	     numbers cannot disagree with the text beside them. -->
	<div class="gutter" bind:this={gutter} aria-hidden="true">{#each lines as _line, i (i)}<span>{i + 1}</span>{/each}</div>
	<div class="code">
		<pre bind:this={view} aria-hidden="true">{#each lines as line, i (i)}<span class="line">{#each line as token, j (j)}<span class={token.type}>{token.text}</span>{/each}</span>{/each}</pre>
		<textarea
			bind:this={field}
			bind:value
			{placeholder}
			{readonly}
			aria-label="The template's CSS"
			spellcheck="false"
			autocapitalize="off"
			wrap="off"
			onkeydown={onKeydown}
			onscroll={sync}
		></textarea>
	</div>
</div>

<style>
	/* The metrics every layer inherits. One declaration, because three layers
	   that size their type separately are three layers that drift apart the
	   first time one of them is edited. */
	/* The height is here rather than on either layer: a gutter tall enough for
	   its own numbers made the row as tall as the sheet, which left the field at
	   its own height beside a column of numbers nothing could scroll. The box
	   sets the height, both children stretch to it, and the numbers overflow
	   where the text does. */
	.editor {
		display: flex;
		align-items: stretch;
		height: 17rem;
		resize: vertical;
		border: 1px solid #ccc;
		border-radius: var(--radius-input);
		background: #fff;
		overflow: hidden;
		font: 0.75rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
		tab-size: 2;
	}

	.editor.readonly {
		background: #fafafa;
	}

	.gutter {
		flex: none;
		box-sizing: border-box;
		min-width: 2.5rem;
		padding: 8px 6px;
		overflow: hidden;
		text-align: right;
		color: #a8a8a8;
		background: #fafafa;
		border-right: 1px solid #eee;
		user-select: none;
	}

	.gutter span {
		display: block;
	}

	/* The field and its coloured twin are positioned in here, so it needs to be
	   the positioned ancestor and nothing else. */
	.code {
		position: relative;
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.code pre,
	.code textarea {
		position: absolute;
		inset: 0;
		box-sizing: border-box;
		margin: 0;
		padding: 8px;
		border: 0;
		font: inherit;
		tab-size: inherit;
		white-space: pre;
		background: transparent;
	}

	.code pre {
		overflow: hidden;
		color: #111;
	}

	/* The text is transparent and the caret is not: what is read is the layer
	   underneath, which is the same characters in the same places. */
	.code textarea {
		overflow: auto;
		resize: none;
		color: transparent;
		caret-color: #111;
	}

	/* Set on purpose — the field's own color is transparent, and a placeholder
	   inheriting that would be a blank editor with no hint in it. */
	.code textarea::placeholder {
		color: #a8a8a8;
		opacity: 1;
	}

	/* A line is a block rather than text and a newline: an each block that wrote
	   its own newlines put one at the end of the last line too, and the editor
	   was one row taller than the text in it. `em` against a 1.5 line-height is
	   that same line box, so an empty line keeps its place in the count. */
	.line {
		display: block;
		min-height: 1.5em;
	}

	/* Seven colours, and the eighth is the text's own: a value is what is left.
	   Carbon's palette at the darker end of each hue, so every one of them holds
	   up against white at 12px. */
	.comment {
		color: #767676;
	}

	.string {
		color: #0e6027;
	}

	.number {
		color: #a2411a;
	}

	.at {
		color: #6929c4;
	}

	.selector {
		color: #005d5d;
	}

	.property {
		color: #0043ce;
	}

	.punct {
		color: #8d8d8d;
	}
</style>
