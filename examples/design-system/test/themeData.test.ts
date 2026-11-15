// @vitest-environment node
/**
 * `src/themeData.ts` is what the browser reads of the knobs and themes, which it
 * cannot import. It is generated, so it must be what the themes and knobs say now.
 */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { generate } from '../scripts/themeData.mjs'

it('is what `pnpm --filter foldkit-example-design-system theme-data` writes', async () => {
  expect(readFileSync(new URL('../src/themeData.ts', import.meta.url), 'utf8')).toBe(
    await generate(),
  )
})
