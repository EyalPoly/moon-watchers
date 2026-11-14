import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@samples': fileURLToPath(new URL('../contract/samples', import.meta.url)) },
  },
  server: { fs: { allow: ['..'] } },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'] },
})
