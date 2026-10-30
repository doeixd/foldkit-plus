// @vitest-environment node
/**
 * A swap whose trial started but whose update then fails stops the stack:
 * Wrangler's harness tears its session down on a failed update, so the stack
 * reports it and swaps nothing after. The stack's own harness is made to fail
 * here, since a Worker that does not start is refused by its trial first.
 */
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'esbuild'
import { afterAll, expect, it, vi } from 'vitest'
import { Stack } from '../src/testing/workers.js'
import type { WatchListener } from '../src/testing/workers.js'

let made = 0
vi.mock('wrangler', async original => {
  const wrangler = await original<typeof import('wrangler')>()
  return {
    ...wrangler,
    createTestHarness: (...args: Parameters<typeof wrangler.createTestHarness>) => {
      const harness = wrangler.createTestHarness(...args)
      // The first harness is the stack's; the ones after it are trials, left as they are.
      made += 1
      if (made > 1) return harness
      const close = harness.close.bind(harness)
      return Object.assign(harness, {
        update: async () => {
          await close()
          throw new Error('the runtime went down')
        },
      })
    },
  }
})

const supported = String(
  createRequire(createRequire(import.meta.url).resolve('wrangler'))('miniflare')
    .supportedCompatibilityDate,
)

let directory = ''
afterAll(() => rm(directory, { recursive: true, force: true }))

const save = async (path: string, text: string) => {
  await writeFile(`${path}.next`, text)
  await rename(`${path}.next`, path)
}

const worker = (version: string) => `export default { fetch: () => new Response('${version}') }\n`

it('reports a failed update as stopped, and swaps nothing after it', async () => {
  directory = await mkdtemp(join(tmpdir(), 'foldkit-plus-stack-'))
  const wrangler = join(directory, 'wrangler.toml')
  const entry = join(directory, 'worker.ts')
  await writeFile(
    wrangler,
    `name = "foldkit-plus-stopped"\nmain = "dist/worker.js"\nno_bundle = true\ncompatibility_date = "${supported}"\n`,
  )
  await writeFile(entry, worker('one'))
  let ends = 0
  const counting: Plugin = { name: 'count', setup: build => build.onEnd(() => void (ends += 1)) }
  const stack = await Stack.start({ wrangler, entry, plugins: [counting] })
  const outcomes: Array<string> = []
  const listener: WatchListener = {
    onSwap: () => outcomes.push('swapped'),
    onRefused: message => outcomes.push(`refused: ${message}`),
    onStopped: message => outcomes.push(`stopped: ${message}`),
  }
  let before = { made, ends }
  try {
    await stack.watch(listener)
    await save(entry, worker('two'))
    await expect
      .poll(() => outcomes, { timeout: 20_000 })
      .toEqual(['stopped: the runtime went down'])
    // A trial of the next change would make a harness of its own.
    before = { made, ends }
    await save(entry, worker('three'))
    await expect.poll(() => ends, { timeout: 20_000 }).toBe(before.ends + 1)
  } finally {
    // Waits for the rebuild's step, and for its trial had it begun one.
    await stack.stop()
  }
  expect(made).toBe(before.made)
  expect(outcomes).toHaveLength(1)
}, 60_000)
