// @vitest-environment node
/**
 * The page's entry chunk holds none of Yielded's client: `client.ts` loads it
 * with `Resource.lazy`, so Vite writes it, and the contract it is built from,
 * into a chunk of its own, which the first sign-in or sign-out imports (#244).
 * Nor the account page's bodies: `account.ts` declares the page with
 * `Bundle.lazy`, and they are a chunk the account route alone loads (#438).
 */
import { resolve } from 'node:path'
import { build } from 'vite'
import { expect, test } from 'vitest'
import { mutation } from '../../../scripts/mutation-plugin.mjs'

const root = resolve(import.meta.dirname, '..')

/** Yielded's browser client and the contract its calls are made from. */
const yielded = (id: string) => /\/@yielded\/auth\/dist\/(http-operation|operations)\//.test(id)

/** The client's chunks, from one build shared by every test here. */
const buildChunks = async () => {
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
    .flatMap(each => ('output' in each ? each.output : []))
    .flatMap(output => (output.type === 'chunk' ? [output] : []))
  return chunks
}
let building: ReturnType<typeof buildChunks> | undefined
const built = () => (building ??= buildChunks())
type Chunk = Awaited<ReturnType<typeof buildChunks>>[number]

const kept = (chunk: Chunk) =>
  Object.entries(chunk.modules)
    .filter(([, module]) => module.renderedLength > 0)
    .map(([id]) => id.replaceAll('\\', '/'))

test("Yielded's client is in a chunk of its own, not the entry", async () => {
  const chunks = await built()
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

/** The account page's bodies: its `update` and `view`. */
const accountBody = (id: string) => id.endsWith('/src/account.body.ts')

test("the account page's bodies are in a chunk of their own, and its declaration in the entry", async () => {
  const chunks = await built()
  const entry = chunks.filter(chunk => chunk.isEntry)
  expect(entry.flatMap(kept).filter(accountBody)).toEqual([])
  // The declaration the parent's Schema and the server's first render need stays.
  expect(chunks.filter(chunk => !chunk.isDynamicEntry).flatMap(kept)).toEqual(
    expect.arrayContaining([expect.stringMatching(/\/src\/account\.ts$/)]),
  )
  const loaded = chunks.filter(chunk => chunk.isDynamicEntry && chunk.name === 'account.body')
  expect(loaded).toHaveLength(1)
  expect(loaded.flatMap(kept).filter(accountBody)).toHaveLength(1)
})
