import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'jsdom',
    passWithNoTests: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
});
