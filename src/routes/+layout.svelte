<script lang="ts">
	// The only job here is to pull in the app-wide stylesheet. Kit needs a layout
	// component to hang it on; there is no shell around the app itself.
	import './app.css';
	import { iconMask } from '$lib/icons';

	let { children } = $props();

	// The checkboxes are Carbon's icons, drawn as masks, and the masks come
	// from icons.ts rather than from copies in the stylesheet. Set once, on the
	// root, with the class that turns the styling on: until then the browser's
	// own checkbox shows, rather than a square with no mask to shape it.
	$effect(() => {
		const root = document.documentElement;
		root.style.setProperty('--mask-checkbox', iconMask('checkbox'));
		root.style.setProperty('--mask-checkbox-checked', iconMask('checkbox-checked'));
		root.style.setProperty('--mask-checkbox-indeterminate', iconMask('checkbox-indeterminate'));
		root.classList.add('icon-checkboxes');
	});
</script>

{@render children()}
