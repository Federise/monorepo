<script lang="ts">
  import { onMount } from 'svelte';
  import CtaButton from './CtaButton.svelte';

  interface Props {
    defaultText?: string;
  }

  let { defaultText = 'Get Started' }: Props = $props();

  let isLoggedIn = $state(false);
  let buttonText = $state('Get Started');

  onMount(() => {
    isLoggedIn = !!localStorage.getItem('federise_user');
    buttonText = isLoggedIn ? 'Manage' : defaultText;
  });

  function handleClick() {
    if (!isLoggedIn) {
      window.location.href = '/start';
    }
  }
</script>

<CtaButton {buttonText} onClick={handleClick} />
