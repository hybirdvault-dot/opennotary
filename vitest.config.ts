import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // The package's "main" field points at a non-existent file; its real entry is index.js.
      'javascript-opentimestamps': path.resolve(__dirname, 'node_modules/javascript-opentimestamps/index.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
});
