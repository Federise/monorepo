import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      'lib/index': 'src/lib/index.ts',
      'utils/index': 'src/utils/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['@federise/sdk', '@federise/proxy', 'svelte', 'openapi-fetch'],
  },
]);
