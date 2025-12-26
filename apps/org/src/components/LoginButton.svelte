<script lang="ts">
  import { onMount } from 'svelte';
  import CtaButton from './CtaButton.svelte';

  const STORAGE_KEY_API = 'federise:gateway:apiKey';
  const STORAGE_KEY_URL = 'federise:gateway:url';


  interface Props {
    defaultText?: string;
  }

  let { defaultText = 'Get Started' }: Props = $props();

  let isLoggedIn = $state(false);
  let buttonText = $state('Get Started');

  onMount(() => {
    const savedKey = localStorage.getItem(STORAGE_KEY_API);
    const savedUrl = localStorage.getItem(STORAGE_KEY_URL);
    isLoggedIn = !!savedKey && !!savedUrl;
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
