<script lang="ts">
	import { CURATED_GOOGLE_FONTS } from '$lib/fonts';
	import type { Box, Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		selected: Box | null;
		onboxchange: (box: Box) => void;
		ontemplatechange: (template: Template) => void;
		onmappingchange: (mapping: Mapping) => void;
		onduplicate: () => void;
		ondelete: () => void;
		onaddbox: () => void;
		onuploadfont: (file: File) => void;
	}

	let {
		template,
		dataset,
		mapping,
		selected,
		onboxchange,
		ontemplatechange,
		onmappingchange,
		onduplicate,
		ondelete,
		onaddbox,
		onuploadfont
	}: Props = $props();

	let fontInput = $state<HTMLInputElement | null>(null);

	const familyOptions = $derived(
		Array.from(new Set([...template.fonts.map((f) => f.family), ...CURATED_GOOGLE_FONTS])).sort((a, b) =>
			a.localeCompare(b)
		)
	);

	const anchorOptions = $derived(template.boxes.filter((b) => b.id !== selected?.id));

	const patch = (change: Partial<Box>) => {
		if (selected) onboxchange({ ...selected, ...change });
	};

	const numeric = (event: Event, fallback: number) => {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		return Number.isFinite(value) ? value : fallback;
	};

	function setFont(value: string) {
		if (value === '__upload') {
			fontInput?.click();
			return;
		}
		if (value === '__custom') {
			const family = window.prompt('Font family name (as Google Fonts spells it)');
			if (!family) return;
			registerFamily(family);
			patch({ font: family });
			return;
		}
		registerFamily(value);
		patch({ font: value });
	}

	function registerFamily(family: string) {
		if (template.fonts.some((f) => f.family.toLowerCase() === family.toLowerCase())) return;
		ontemplatechange({ ...template, fonts: [...template.fonts, { family, source: 'google' }] });
	}

	function setSlot(slot: string) {
		const value = slot.trim();
		patch({ slot: value || null });
		if (value && !template.slots.includes(value)) {
			ontemplatechange({ ...template, slots: [...template.slots, value] });
		}
	}

	function setAnchor(value: string) {
		if (!selected) return;
		if (!value) patch({ anchor: null });
		else patch({ anchor: { to: value, gap: selected.anchor?.gap ?? 4 } });
	}

	function uploadFont(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onuploadfont(file);
		input.value = '';
	}
</script>

<div class="options" aria-label="Options">
	{#if selected}
		<span class="context">Box</span>

		<label class="field">
			<span>Slot</span>
			<input
				class="w-6"
				value={selected.slot ?? ''}
				placeholder="static"
				onchange={(e) => setSlot(e.currentTarget.value)}
			/>
		</label>

		{#if selected.slot}
			<label class="field">
				<span>Column</span>
				<select
					value={mapping[selected.slot] ?? ''}
					onchange={(e) => onmappingchange({ ...mapping, [selected.slot as string]: e.currentTarget.value })}
				>
					<option value="">— none —</option>
					{#each dataset.columns as column (column)}
						<option value={column}>{column}</option>
					{/each}
				</select>
			</label>
		{/if}

		<label class="field">
			<span>Font</span>
			<select value={selected.font ?? template.defaults.font} onchange={(e) => setFont(e.currentTarget.value)}>
				{#each familyOptions as family (family)}
					<option value={family}>{family}</option>
				{/each}
				<option value="__custom">Other family…</option>
				<option value="__upload">Upload a font file…</option>
			</select>
		</label>

		<label class="field">
			<span>Size</span>
			<input
				class="w-4"
				type="number"
				step="0.5"
				min="1"
				value={selected.size ?? template.defaults.size}
				onchange={(e) => patch({ size: numeric(e, template.defaults.size) })}
			/>
		</label>

		<label class="field">
			<span>Weight</span>
			<select
				value={String(selected.weight ?? template.defaults.weight)}
				onchange={(e) => patch({ weight: Number(e.currentTarget.value) })}
			>
				{#each [300, 400, 500, 600, 700, 800] as weight (weight)}
					<option value={String(weight)}>{weight}</option>
				{/each}
			</select>
		</label>

		<label class="field">
			<span>Leading</span>
			<input
				class="w-4"
				type="number"
				step="0.05"
				min="0.8"
				value={selected.lineHeight ?? template.defaults.lineHeight}
				onchange={(e) => patch({ lineHeight: numeric(e, template.defaults.lineHeight) })}
			/>
		</label>

		<label class="field">
			<span>Align</span>
			<select value={selected.align ?? template.defaults.align} onchange={(e) => patch({ align: e.currentTarget.value as Box['align'] })}>
				<option value="left">left</option>
				<option value="center">center</option>
				<option value="right">right</option>
			</select>
		</label>

		<label class="field">
			<span>Colour</span>
			<input
				class="colour"
				type="color"
				value={selected.color ?? template.defaults.color}
				onchange={(e) => patch({ color: e.currentTarget.value })}
			/>
		</label>

		<label class="field">
			<span>Mode</span>
			<select value={selected.mode} onchange={(e) => patch({ mode: e.currentTarget.value as Box['mode'] })}>
				<option value="plain">plain</option>
				<option value="markdown">markdown</option>
				<option value="image">image</option>
			</select>
		</label>

		<label class="field">
			<span>Overflow</span>
			<select value={selected.overflow} onchange={(e) => patch({ overflow: e.currentTarget.value as Box['overflow'] })}>
				<option value="grow">grow</option>
				<option value="clip">clip</option>
			</select>
		</label>

		<span class="group" role="group" aria-label="Geometry in millimetres">
			<label class="field"><span>X</span>
				<input class="w-4" type="number" step="0.5" value={selected.x} onchange={(e) => patch({ x: numeric(e, selected.x) })} />
			</label>
			<label class="field"><span>Y</span>
				<input
					class="w-4"
					type="number"
					step="0.5"
					value={selected.y}
					disabled={!!selected.anchor}
					title={selected.anchor ? 'Anchored: the gap sets the top edge' : ''}
					onchange={(e) => patch({ y: numeric(e, selected.y) })}
				/>
			</label>
			<label class="field"><span>W</span>
				<input class="w-4" type="number" step="0.5" value={selected.w} onchange={(e) => patch({ w: numeric(e, selected.w) })} />
			</label>
			<label class="field"><span>H</span>
				<input class="w-4" type="number" step="0.5" value={selected.h} onchange={(e) => patch({ h: numeric(e, selected.h) })} />
			</label>
		</span>

		<label class="field">
			<span>Anchor</span>
			<select value={selected.anchor?.to ?? ''} onchange={(e) => setAnchor(e.currentTarget.value)}>
				<option value="">— fixed Y —</option>
				{#each anchorOptions as box (box.id)}
					<option value={box.id}>{box.slot ?? box.id}</option>
				{/each}
			</select>
		</label>

		{#if selected.anchor}
			<label class="field">
				<span>Gap</span>
				<input
					class="w-4"
					type="number"
					step="0.5"
					min="0"
					value={selected.anchor.gap}
					onchange={(e) => patch({ anchor: { to: selected.anchor!.to, gap: numeric(e, selected.anchor!.gap) } })}
				/>
			</label>
		{/if}

		<label class="check">
			<input
				type="checkbox"
				checked={!!selected.hideWhenEmpty}
				onchange={(e) => patch({ hideWhenEmpty: e.currentTarget.checked })}
			/>
			Hide when empty
		</label>

		<span class="spacer"></span>
		<button onclick={onduplicate}>Duplicate</button>
		<button onclick={ondelete}>Delete</button>
	{:else}
		<span class="context">Page</span>

		<label class="field">
			<span>Template</span>
			<input class="w-10" value={template.name} onchange={(e) => ontemplatechange({ ...template, name: e.currentTarget.value })} />
		</label>

		<label class="field">
			<span>Width</span>
			<input
				class="w-4"
				type="number"
				step="1"
				value={template.page.w}
				onchange={(e) => ontemplatechange({ ...template, page: { ...template.page, w: numeric(e, template.page.w) } })}
			/>
		</label>
		<label class="field">
			<span>Height</span>
			<input
				class="w-4"
				type="number"
				step="1"
				value={template.page.h}
				onchange={(e) => ontemplatechange({ ...template, page: { ...template.page, h: numeric(e, template.page.h) } })}
			/>
		</label>

		<label class="field">
			<span>Body font</span>
			<select
				value={template.defaults.font}
				onchange={(e) => ontemplatechange({ ...template, defaults: { ...template.defaults, font: e.currentTarget.value } })}
			>
				{#each familyOptions as family (family)}
					<option value={family}>{family}</option>
				{/each}
			</select>
		</label>

		<label class="field">
			<span>Body size</span>
			<input
				class="w-4"
				type="number"
				step="0.5"
				value={template.defaults.size}
				onchange={(e) =>
					ontemplatechange({ ...template, defaults: { ...template.defaults, size: numeric(e, template.defaults.size) } })}
			/>
		</label>

		<label class="check">
			<input
				type="checkbox"
				checked={template.bleed.enabled}
				onchange={(e) => ontemplatechange({ ...template, bleed: { ...template.bleed, enabled: e.currentTarget.checked } })}
			/>
			Bleed
		</label>

		{#if template.bleed.enabled}
			<label class="field">
				<span>Amount</span>
				<input
					class="w-4"
					type="number"
					step="0.5"
					min="0"
					value={template.bleed.amount}
					onchange={(e) =>
						ontemplatechange({ ...template, bleed: { ...template.bleed, amount: numeric(e, template.bleed.amount) } })}
				/>
			</label>
			<label class="check">
				<input
					type="checkbox"
					checked={template.bleed.cropMarks}
					onchange={(e) => ontemplatechange({ ...template, bleed: { ...template.bleed, cropMarks: e.currentTarget.checked } })}
				/>
				Crop marks
			</label>
		{/if}

		<span class="spacer"></span>
		<button onclick={onaddbox}>+ Box</button>
	{/if}

	<input bind:this={fontInput} type="file" accept=".woff2,.woff,.otf,.ttf" hidden onchange={uploadFont} />
</div>

<style>
	.options {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 10px;
		padding: 8px 12px;
		border-bottom: 1px solid #ddd;
		background: #f7f7f7;
		font: 12px ui-sans-serif, system-ui, sans-serif;
	}

	.context {
		font-weight: 600;
		color: #767676;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 10px;
	}

	.field {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #555;
	}

	.field > span {
		font-size: 11px;
	}

	.group {
		display: inline-flex;
		gap: 8px;
		padding: 2px 8px;
		border-left: 1px solid #ddd;
		border-right: 1px solid #ddd;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #555;
	}

	input,
	select {
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 4px 5px;
		border: 1px solid #ccc;
		border-radius: 5px;
		background: #fff;
		color: #111;
	}

	input:disabled {
		background: #f0f0f0;
		color: #999;
	}

	.w-4 { width: 4.5rem; }
	.w-6 { width: 6.5rem; }
	.w-10 { width: 11rem; }
	.colour { width: 2.2rem; padding: 2px; }

	.spacer {
		flex: 1;
	}

	button {
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 5px 10px;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
	}

	button:hover {
		border-color: #999;
	}
</style>
