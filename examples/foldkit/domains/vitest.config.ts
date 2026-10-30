import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'foldkit-domains',
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'happy-dom',
    setupFiles: ['./src/client/vitest-setup.ts'],
    server: {
      deps: {
        inline: ['foldkit', '@foldkit/ui', '@foldkit/devtools'],
      },
    },
  },
})
