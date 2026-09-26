import { mergeConfig } from 'vitest/config'
import { shared } from './vitest.shared.js'

export default mergeConfig(shared, {
  test: {
    include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'],
  },
})
