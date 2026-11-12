// @vitest-environment node
/**
 * #472: a page whose entry is `foldkit-ssr/loader` loads no module of
 * `effect`, Foldkit or the application at start, and `runtimeChunk` writes
 * the address of the very chunk the loader's dynamic import runs into the
 * loader, so it can fetch that chunk without running it.
 */
import { resolve } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import { build, type Rolldown } from 'vite'
import { beforeAll, expect, it } from 'vitest'
import { mutation } from '../../../scripts/mutation-plugin.mjs'
import { runtimeChunk } from '../src/runtimeChunk.js'

const root = resolve(import.meta.dirname, 'loader-site')

type Chunk = Rolldown.OutputChunk
let chunks: ReadonlyArray<Chunk> = []

beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [mutation(), runtimeChunk({ entry: '/src/entry.ts' })],
    resolve: { conditions: ['foldkit-plus:source'] },
    build: { write: false, minify: false },
  })
  chunks = [result]
    .flat()
    .flatMap(built => ('output' in built ? built.output : []))
    .flatMap(output => (output.type === 'chunk' ? [output] : []))
}, 120_000)

const byFile = (file: string): Chunk => {
  const chunk = chunks.find(each => each.fileName === file)
  if (chunk === undefined) throw new Error(`no chunk ${file}`)
  return chunk
}

/** The page's entry and every chunk it imports statically: what loads at start. */
const atStart = (): ReadonlyArray<Chunk> => {
  const entry = chunks.find(chunk => chunk.facadeModuleId?.endsWith('index.html'))
  if (entry === undefined) throw new Error('no page entry')
  const seen = new Map<string, Chunk>()
  const visit = (chunk: Chunk): void => {
    if (seen.has(chunk.fileName)) return
    seen.set(chunk.fileName, chunk)
    for (const file of chunk.imports) visit(byFile(file))
  }
  visit(entry)
  return [...seen.values()]
}

const modulesOf = (chunk: Chunk): ReadonlyArray<string> =>
  Object.entries(chunk.modules)
    .filter(([, module]) => module.renderedLength > 0)
    .map(([id]) => id.replaceAll('\\', '/'))

it('loads no module of effect, Foldkit or the application at start', () => {
  const modules = atStart().flatMap(modulesOf)
  expect(modules).toEqual(expect.arrayContaining([expect.stringMatching(/ssr\/src\/loader\.ts$/)]))
  expect(
    modules.filter(id =>
      /\/effect\/|\/foldkit\/dist\/|loader-site\/src\/entry\.ts|Fixture/.test(id),
    ),
  ).toEqual([])
  const brotli = atStart()
    .map(chunk => brotliCompressSync(chunk.code).byteLength)
    .reduce((sum, bytes) => sum + bytes, 0)
  // Decision 5's bar for domains-plus is under 10 KB at start.
  expect(brotli).toBeLessThan(10_000)
})

it("writes the runtime chunk's address into the loader", () => {
  const runtime = chunks.filter(chunk =>
    modulesOf(chunk).some(id => id.endsWith('loader-site/src/entry.ts')),
  )
  expect(runtime).toHaveLength(1)
  const code = atStart()
    .map(chunk => chunk.code)
    .join('\n')
  expect(code).toContain(`/${runtime[0]!.fileName}`)
  expect(code).not.toMatch(/runtimeUrl\s*=\s*["']foldkit-ssr:runtime-url/)
})
