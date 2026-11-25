import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/config.ts', 'src/cli.ts', 'src/client.tsx'],
  format: 'esm',
  dts: true,
  clean: true,
  external: ['@netai/core', '@netai/react', 'next', 'react']
});
