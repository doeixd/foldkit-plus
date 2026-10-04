// @vitest-environment node
/**
 * `foldkit-ssr/client` is what a hydrating page loads, so it must not bring
 * Foldkit's server renderer and HTML parser along, as `foldkit-ssr` does.
 */
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { FOLDKIT_APP_ATTRIBUTE as SERVER_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { describe, expect, it } from 'vitest'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit-ssr/client'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/** Every module a bundle of `entry` reads, as esbuild resolves a browser build. */
const modulesOf = async (entry: string): Promise<ReadonlyArray<string>> => {
  const bundled = await build({
    entryPoints: [here(entry)],
    tsconfig: here('../tsconfig.json'),
    conditions: ['foldkit-plus:source'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    metafile: true,
    logLevel: 'silent',
  })
  return Object.keys(bundled.metafile.inputs)
}

const fromServer = (path: string) => /foldkit\/dist\/experimental\/server\//.test(path)

describe('foldkit-ssr/client', () => {
  it('reaches no module of foldkit/experimental/server', async () => {
    const [client, full] = await Promise.all([
      modulesOf('../src/client.ts'),
      modulesOf('../src/index.ts'),
    ])
    expect(client.some(path => path.endsWith('ssr/src/client.ts'))).toBe(true)
    expect(client.filter(fromServer)).toEqual([])
    // The same walk sees the server where it is.
    expect(full.some(fromServer)).toBe(true)
    // Two whole bundles: under 400ms alone, past the default 5s beside the full suite.
  }, 60_000)

  it('names the root attribute Foldkit’s server stamps', () => {
    expect(FOLDKIT_APP_ATTRIBUTE).toBe(SERVER_APP_ATTRIBUTE)
  })
})
