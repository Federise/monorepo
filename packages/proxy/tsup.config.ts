import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'backends/index': 'src/backends/index.ts',
    'transports/index': 'src/transports/index.ts',
    'capabilities/index': 'src/capabilities/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@federise/sdk'],
});
