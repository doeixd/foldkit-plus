// @vitest-environment node
/**
 * The stack `wrangler.toml` configures: a change to the Worker's source swaps
 * the new Worker in at the same origin over the same D1, a change that does
 * not build leaves the running one answering, a Worker that does not start
 * stops the stack and says so, and a configuration the local runtime would
 * quietly run differently is refused before anything starts.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WorkerEnv } from '../src/worker.js'
import { checkCompatibilityDate, startWorkersStack, type WorkersStack } from '../src/workers.js'

const wrangler = fileURLToPath(new URL('../wrangler.toml', import.meta.url))

let directory: string
let entry: string
let stack: WorkersStack<WorkerEnv>

/** A Worker that answers `version`, with the class `wrangler.toml` binds. */
const source = (version: string) => `
import { DurableObject } from 'cloudflare:workers'
export class SyncHost extends DurableObject {}
export default { fetch: () => new Response('${version}') }
`

const answer = async () => (await fetch(stack.origin)).text()

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'foldkit-workers-test-'))
  entry = join(directory, 'worker.ts')
  await writeFile(entry, source('one'))
})

afterAll(() => rm(directory, { recursive: true, force: true }))

describe('a watched stack', () => {
  beforeAll(async () => {
    stack = await startWorkersStack<WorkerEnv>({ wrangler, entry })
  }, 120_000)

  afterAll(() => stack?.stop(), 120_000)

  it('swaps a changed Worker in at the same origin, keeping D1, until one does not start', async () => {
    expect(await answer()).toBe('one')
    await (
      await stack.env()
    ).DB.prepare("INSERT INTO todos (id, title, done) VALUES ('kept', 'Kept', 0)").run()

    const outcomes: Array<string> = []
    await stack.watch({
      onSwap: () => outcomes.push('swapped'),
      onBuildError: message => outcomes.push(`build error: ${message}`),
      onStopped: message => outcomes.push(`stopped: ${message}`),
    })
    await writeFile(entry, source('two'))
    await expect.poll(() => outcomes, { timeout: 20_000 }).toEqual(['swapped'])
    expect(await answer()).toBe('two')
    const rows = await (await stack.env()).DB.prepare('SELECT id FROM todos').all()
    expect(rows.results).toEqual([{ id: 'kept' }])

    await writeFile(entry, `${source('three')}\nexport const broken = (`)
    await expect.poll(() => outcomes.length, { timeout: 20_000 }).toBe(2)
    expect(outcomes[1]).toMatch(/^build error: /)
    expect(await answer()).toBe('two')

    // Builds, but workerd refuses a named export that is not a handler.
    await writeFile(entry, `${source('three')}\nexport const notAHandler = 1`)
    await expect.poll(() => outcomes.length, { timeout: 20_000 }).toBe(3)
    expect(outcomes[2]).toMatch(/^stopped: .*notAHandler/s)
    await expect(answer()).rejects.toThrow()
  }, 120_000)
})

describe('wrangler.toml', () => {
  const refused = async (edit: (toml: string) => string) => {
    const path = join(directory, 'wrangler.toml')
    await writeFile(path, edit(await readFile(wrangler, 'utf8')))
    return startWorkersStack({ wrangler: path, entry }).then(
      () => 'started',
      (error: Error) => error.message,
    )
  }

  it.each([
    [
      'a date this workerd does not know',
      /compatibility_date = ".*"/,
      'compatibility_date = "2999-01-01"',
      /supports up to/,
    ],
    ['no date', /compatibility_date = ".*"\n/, '', /compatibility_date/],
    ['a bundle Wrangler would bundle again', 'no_bundle = true', 'no_bundle = false', /no_bundle/],
    [
      'an environment the stack would not run',
      /$/,
      '\n[env.staging]\nname = "staging"\n',
      /\[env\.\*\]/,
    ],
  ] as const)('refuses %s', async (_, find, replace, message) => {
    expect(await refused(toml => toml.replace(find, replace))).toMatch(message)
  })

  it.each([
    ['2026-07-30', '2026-07-30', true],
    ['2026-07-29', '2026-07-30', true],
    ['2026-07-31', '2026-07-30', false],
  ])('runs %s on a workerd that supports %s: %s', (date, supported, runs) => {
    const run = () => checkCompatibilityDate(date, supported)
    if (runs) expect(run).not.toThrow()
    else expect(run).toThrow(/supports up to 2026-07-30/)
  })
})
