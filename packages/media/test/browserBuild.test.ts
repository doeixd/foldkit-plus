// @vitest-environment node
/**
 * The entries a page imports reach no `node:` module, built as this package
 * publishes them. Built for Node, the runtime chunk every entry shares
 * carried `import "node:module"` into the browser's bundle (#215).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { build } from 'tsdown'
import { afterAll, expect, test } from 'vitest'
import config from '../tsdown.config.js'

const packageDir = resolve(import.meta.dirname, '..')
const out = mkdtempSync(join(tmpdir(), 'foldkit-media-build-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

/** Every `node:` module a built file reaches, through the chunks it imports. */
const nodeModulesFrom = (entry: string): ReadonlyArray<string> => {
  const seen = new Set<string>()
  const found = new Set<string>()
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const specifiers = readFileSync(file, 'utf8').matchAll(
      /^\s*(?:import|export)\b[^'"]*?(?:from\s*)?["']([^"']+)["']/gm,
    )
    for (const [, specifier = ''] of specifiers) {
      if (specifier.startsWith('node:')) found.add(specifier)
      else if (specifier.startsWith('.')) walk(resolve(dirname(file), specifier))
    }
  }
  walk(join(out, entry))
  return [...found]
}

test('the entries a page imports reach no node: module', async () => {
  await build({
    ...config,
    config: false,
    cwd: packageDir,
    outDir: out,
    dts: false,
    logLevel: 'silent',
  })
  for (const entry of ['index.mjs', 'browser/index.mjs', 'icons/index.mjs', 'unpic/index.mjs'])
    expect(nodeModulesFrom(entry), entry).toEqual([])
  // The walk finds them where they are: the Vite plugin runs in Node.
  expect(nodeModulesFrom('vite/index.mjs')).toContain('node:module')
}, 120_000)
