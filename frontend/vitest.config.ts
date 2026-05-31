import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    // STUB: Switch environment to 'jsdom' and add jsdom devDep when
    // component tests land in Block 1B/1D.
    // See BUILD-PLAN.md Block 1B and FRONTEND-SPEC.md.
    environment: 'node',
    passWithNoTests: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
});
