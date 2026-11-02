// @vitest-environment node
/**
 * The no-JavaScript selects carry no hydration identity per option (#465).
 * The view-identity transform brands what every function returns and the
 * serializer writes a `data-foldkit-identity` marker for each branded vnode,
 * so an option built in a mapper's return is one marker, 557 times on the TLD
 * select. The transform's own output is the evidence: no option is built in a
 * branded position.
 */
import { resolve } from 'node:path'
import { transformViewIdentity } from '@foldkit/vite-plugin'
import { transformWithEsbuild } from 'vite'
import source from '../src/client/filters.ts?raw'
import { expect, test } from 'vitest'

test('no option the plain select draws is wrapped in a brand call', async () => {
  const root = resolve(import.meta.dirname, '..')
  const id = resolve(root, 'src/client/filters.ts')
  // The plugin runs after esbuild, on JavaScript.
  const js = await transformWithEsbuild(source, id)
  const result = transformViewIdentity(js.code, id, root)
  expect(result).not.toBeNull()
  const branded = result?.code ?? ''
  expect(branded).toContain('h.option(')
  expect(branded).not.toMatch(/__foldkitBrandViewResult\(\(\s*h\.option\(/)
  expect(branded).not.toMatch(/__foldkitBrandViewResult\(\(\s*options\b/)
})
