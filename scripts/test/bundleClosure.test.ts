// @vitest-environment node
/**
 * The packages whose `dist` the bundle report builds before it bundles an example. A package the
 * example bundles but lists only under `devDependencies` (the site's mixins-ui) was left out, so it
 * resolved from source unless another budget had built it first, and the site's reading moved by
 * 200 bytes with test order.
 */
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { workspaceClosure } from '../bundle-report.mjs'

test("an example's devDependencies are built, and what its packages need follow", () => {
  const closure = workspaceClosure(resolve(import.meta.dirname, '../../examples/site'))
  expect(closure).toContain('mixins-ui')
  expect(closure).toContain('primitives')
})
