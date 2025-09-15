/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // UI configuration for browser debugging (disabled by default for CI/containers)
    ui: false,
    open: false,
    // Reporter configuration
    reporters: ['verbose'],
    // Coverage configuration
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test-setup.ts', '**/*.test.{ts,tsx}', '**/*.config.{ts,js}'],
    },
    // Test timeout for debugging
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
