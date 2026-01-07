// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// Plugin to add COOP/COEP headers for WebContainers
function crossOriginIsolationPlugin() {
  return {
    name: 'cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        next();
      });
    }
  };
}

// https://astro.build/config
export default defineConfig({
  integrations: [svelte()],
  vite: {
    plugins: [crossOriginIsolationPlugin()],
    optimizeDeps: {
      include: ['@xterm/xterm', '@xterm/addon-fit']
    }
  }
});
