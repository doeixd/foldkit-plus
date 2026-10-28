// @vitest-environment node
/**
 * A stack whose harness throws as it closes still removes the bundle's
 * directory, and `stop` reports the throw.
 */
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'esbuild'
import { afterAll, expect, it, vi } from 'vitest'
import { Stack } from '../src/testing/workers.js'

vi.mock('wrangler', async original => {
  const wrangler = await original<typeof import('wrangler')>()
  return {
    ...wrangler,
    createTestHarness: (...args: Parameters<typeof wrangler.createTestHarness>) => {
      const harness = wrangler.createTestHarness(...args)
      const close = harness.close.bind(harness)
      return Object.assign(harness, {
        close: async () => {
          await close()
          throw new Error('close failed')
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

it('removes the bundle when the harness throws as it closes', async () => {
  directory = await mkdtemp(join(tmpdir(), 'foldkit-plus-stack-'))
  await writeFile(
    join(directory, 'wrangler.toml'),
    `name = "foldkit-plus-close"\nmain = "dist/worker.js"\nno_bundle = true\ncompatibility_date = "${supported}"\n`,
  )
  await writeFile(
    join(directory, 'worker.ts'),
    "export default { fetch: () => new Response('one') }\n",
  )
  let bundled = ''
  const probe: Plugin = {
    name: 'probe',
    setup: build => {
      bundled = build.initialOptions.outdir ?? ''
    },
  }
  const stack = await Stack.start({
    wrangler: join(directory, 'wrangler.toml'),
    entry: join(directory, 'worker.ts'),
    plugins: [probe],
  })
  // There before the stop.
  await access(bundled)
  await expect(stack.stop()).rejects.toThrow('close failed')
  await expect(access(bundled)).rejects.toThrow()
}, 60_000)
