<script lang="ts">
	// The only job here is to pull in the app-wide stylesheet. Kit needs a layout
	// component to hang it on; there is no shell around the app itself.
	import './app.css';

	let { children } = $props();
</script>

{@render children()}
