// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },

    imageService: 'cloudflare',
  }),
  integrations: [svelte()],
  vite: {
    server: {
      hmr: {
        // Use the same port as the dev server for HMR WebSocket
        clientPort: 4321,
      },
    },
  },
});
