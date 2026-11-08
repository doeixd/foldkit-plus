// @vitest-environment node
/**
 * The sheet's size budget (#487): the brotli CSS the pages link, as
 * `vite.config.ts`'s `styles` ships it, every class completed and the theme
 * pruned to the tokens it reads.
 */
import { brotliCompressSync } from 'node:zlib'
import { Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { expect, test } from 'vitest'
import { record } from '../../../../scripts/perf-report.mjs'
import { stylesheet } from '../src/client/style.js'

// Brotli bytes. 10.6 kB measured on 2026-11-08 from a `vite build`, against
// 15.2 kB before the prune; the ceiling is that plus about 1%.
const CEILING = 10_700

test('the pages link at most the budgeted brotli CSS', () => {
  const shipped = Theme.prune(Style.complete(stylesheet))
  const brotli = brotliCompressSync(shipped).length
  record({ kind: 'size', name: 'domains-plus CSS, brotli', value: brotli, budget: CEILING })
  expect(brotli).toBeLessThanOrEqual(CEILING)
  // A drop of more than 10% means the ceiling is stale: lower it.
  expect(brotli).toBeGreaterThan(CEILING * 0.9)
})
