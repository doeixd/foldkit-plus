// @vitest-environment node
/**
 * The page's entry chunk holds none of Yielded's client: `client.ts` loads it
 * with `Resource.lazy`, so Vite writes it, and the contract it is built from,
 * into a chunk of its own, which the first sign-in or sign-out imports (#244).
 */
import { resolve } from 'node:path'
import { build } from 'vite'
import { expect, test } from 'vitest'
import { mutation } from '../../../scripts/mutation-plugin.mjs'

const root = resolve(import.meta.dirname, '..')

/** Yielded's browser client and the contract its calls are made from. */
const yielded = (id: string) => /\/@yielded\/auth\/dist\/(http-operation|operations)\//.test(id)

test("Yielded's client is in a chunk of its own, not the entry", async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [mutation()],
    resolve: { conditions: ['foldkit-plus:source'] },
    define: { 'import.meta.env.FOLDKIT_BUILD_ID': '"split"' },
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: resolve(root, 'src/client.ts') },
    },
  })
  const chunks = [result]
    .flat()
    .flatMap(built => ('output' in built ? built.output : []))
    .flatMap(output => (output.type === 'chunk' ? [output] : []))
  const kept = (chunk: (typeof chunks)[number]) =>
    Object.entries(chunk.modules)
      .filter(([, module]) => module.renderedLength > 0)
      .map(([id]) => id.replaceAll('\\', '/'))

  const entry = chunks.filter(chunk => chunk.isEntry)
  expect(entry).toHaveLength(1)
  expect(entry.flatMap(kept).filter(yielded)).toEqual([])

  const loaded = chunks.filter(chunk => chunk.isDynamicEntry && chunk.name === 'authClient')
  expect(loaded).toHaveLength(1)
  expect(loaded.flatMap(kept).filter(yielded)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/http-operation\/auth-client\.mjs$/),
      expect.stringMatching(/operations\/operation\.mjs$/),
    ]),
  )
})
