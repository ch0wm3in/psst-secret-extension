import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // PBKDF2 with 600,000 iterations is slow in CI.
    testTimeout: 30_000,
  },
});
