import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for database setup and API calls
    hookTimeout: 60000, // 60 seconds for beforeAll/afterAll hooks
    include: [
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'
    ],
    exclude: [
      'node_modules',
      'dist'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.{js,ts}'
      ]
    }
  },
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname
    }
  }
})