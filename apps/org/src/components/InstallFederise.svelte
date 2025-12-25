<script lang="ts">
  import CtaButton from './CtaButton.svelte';

  function handleClick() {
    navigator.serviceWorker.register('/sw.js');
  }
</script>

<CtaButton buttonText="Install Federise" onClick={handleClick} />
