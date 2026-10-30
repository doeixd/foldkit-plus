// Run from here, the tests resolve workspace packages exactly as from the root.
import { mergeConfig } from 'vitest/config'
import { shared } from '../../../vitest.shared.js'

export default mergeConfig(shared, {
  test: { include: ['test/**/*.test.ts'], exclude: ['test/**/*.browser.test.ts'] },
})
