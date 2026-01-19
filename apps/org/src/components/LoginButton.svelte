<script lang="ts">
  import { onMount } from 'svelte';
  import CtaButton from './CtaButton.svelte';
  import { createVaultStorage } from '@federise/proxy';

  interface Props {
    defaultText?: string;
  }

  let { defaultText = 'Get Started' }: Props = $props();

  let isLoggedIn = $state(false);
  let buttonText = $state('Get Started');

  onMount(() => {
    // Check if vault has any identities
    const vault = createVaultStorage(localStorage);
    const gateways = vault.getGateways();
    isLoggedIn = gateways.length > 0;
    buttonText = isLoggedIn ? 'Manage' : defaultText;
  });

  function handleClick() {
    if (!isLoggedIn) {
      window.location.href = '/start';
    }
    window.location.href = '/manage';
  }
</script>

<CtaButton {buttonText} onClick={handleClick} />
