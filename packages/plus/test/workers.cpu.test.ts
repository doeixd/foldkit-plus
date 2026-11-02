// @vitest-environment node
/**
 * CPU budgets: a route that spends more CPU than its budget fails, read from
 * a stack's workerd and from a handler run in this thread; the first
 * request is read apart from the ones after it; a failed answer proves
 * nothing of a route's cost; and two stacks started at once cannot tell
 * their workerd apart. The Worker spins on the clock, which a local workerd
 * moves while code runs (a deployed one does not).
 */
import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Cpu, Stack } from '../src/testing/workers.js'

const supported = String(
  createRequire(createRequire(import.meta.url).resolve('wrangler'))('miniflare')
    .supportedCompatibilityDate,
)

/** Keeps the thread busy for `ms` of its clock. */
const spin = (ms: number) => {
  const end = performance.now() + ms
  while (performance.now() < end);
}

/** `/spin?ms=` is busy that long, `/once` only on its first request, `/fail` a 500. */
const source = `
let first = true
const spin = ms => { const end = performance.now() + ms; while (performance.now() < end); }
export default {
  fetch: request => {
    const url = new URL(request.url)
    if (url.pathname === '/spin') spin(Number(url.searchParams.get('ms')))
    if (url.pathname === '/once' && first) { first = false; spin(150) }
    if (url.pathname === '/fail') return new Response('broken', { status: 500 })
    return new Response('ok')
  },
}
`

let directory: string
const worker = () => ({
  wrangler: join(directory, 'wrangler.toml'),
  entry: join(directory, 'worker.js'),
})

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'foldkit-plus-cpu-'))
  await writeFile(
    join(directory, 'wrangler.toml'),
    `name = "foldkit-plus-cpu"\nmain = "dist/worker.js"\nno_bundle = true\ncompatibility_date = "${supported}"\n`,
  )
  await writeFile(join(directory, 'worker.js'), source)
})

afterAll(() => rm(directory, { recursive: true, force: true }))

describe("a stack's workerd", () => {
  let stack: Stack<unknown>

  beforeAll(async () => {
    stack = await Stack.start({ ...worker(), console: 'quiet' })
  }, 120_000)

  afterAll(() => stack?.stop(), 120_000)

  it('passes a route under budget and fails one over it, with every reading', async () => {
    const readings = await Cpu.budget(stack.cpu, { routes: { cheap: '/' }, warm: 20 })
    expect(readings).toEqual([expect.objectContaining({ route: 'cheap', status: 200 })])
    expect(readings[0]!.warm).toBeLessThan(20)

    const failed = await Cpu.budget(stack.cpu, {
      routes: { cheap: '/', busy: '/spin?ms=80' },
      warm: 20,
    }).then(
      () => 'passed',
      (error: Error) => error.message,
    )
    expect(failed).toMatch(/^Over the CPU budget \(warm 20 ms\): busy\n/)
    expect(failed).toMatch(/cheap: cold [\d.]+ ms, warm [\d.]+ ms \(status 200\)/)
    // The busy route's reading is about the time it spins.
    const busy = Number(/busy: cold [\d.]+ ms, warm ([\d.]+) ms/.exec(failed)?.[1])
    expect(busy).toBeGreaterThan(50)
  }, 60_000)

  it('reads the first request apart from the ones after it', async () => {
    const readings = await Cpu.budget(stack.cpu, { routes: { once: '/once' }, warm: 40 })
    expect(readings[0]!.cold).toBeGreaterThan(100)
    expect(readings[0]!.warm).toBeLessThan(40)

    // `/once` is warm by now: the cold budget is met.
    await Cpu.budget(stack.cpu, { routes: { once: '/once' }, warm: 40, cold: 100 })
    await expect(
      Cpu.budget(stack.cpu, { routes: { busy: '/spin?ms=80' }, warm: 1000, cold: 40 }),
    ).rejects.toThrow(/^Over the CPU budget \(warm 1000 ms, cold 40 ms\): busy\n/)
  }, 60_000)

  it('refuses a route that fails, however cheap', async () => {
    await expect(Cpu.budget(stack.cpu, { routes: { fail: '/fail' }, warm: 20 })).rejects.toThrow(
      'Cpu.budget: fail answered 500.',
    )
  }, 60_000)
})

describe('a handler in this thread', () => {
  const meter = Cpu.inThread(async request => {
    spin(Number(new URL(request.url).searchParams.get('ms') ?? 0))
    return new Response('ok')
  })

  it('passes a cheap handler and fails a busy one', async () => {
    await Cpu.budget(meter, { routes: { cheap: '/' }, warm: 10, cold: 10 })
    await expect(
      Cpu.budget(meter, {
        routes: { busy: () => new Request('http://localhost/?ms=30') },
        warm: 10,
      }),
    ).rejects.toThrow(/^Over the CPU budget \(warm 10 ms\): busy\n/)
  })

  it('takes a whole number of runs from 1', async () => {
    await expect(Cpu.budget(meter, { routes: { cheap: '/' }, warm: 10, runs: 0 })).rejects.toThrow(
      'runs must be a whole number from 1',
    )
  })
})

it('refuses to read either of two stacks started at once', async () => {
  const stacks = await Promise.all([
    Stack.start({ ...worker(), console: 'quiet' }),
    Stack.start({ ...worker(), console: 'quiet' }),
  ])
  try {
    for (const stack of stacks)
      await expect(stack.cpu.spent()).rejects.toThrow('Another stack started in this process')
  } finally {
    await Promise.all(stacks.map(stack => stack.stop()))
  }
}, 120_000)
