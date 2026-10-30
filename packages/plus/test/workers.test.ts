// @vitest-environment node
/**
 * The stack a Wrangler configuration describes: the Worker runs with the
 * configuration's D1, migrated, and the vars and secrets given; a change to
 * its source swaps the new Worker in at the same origin over the same D1, a
 * change that does not build leaves the running one answering, a Worker that
 * does not start stops the stack and says so, and a configuration the local
 * runtime would quietly run differently is refused before anything starts.
 */
import type { Plugin } from 'esbuild'
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { peer } from '../src/testing/peer.js'
import { Stack } from '../src/testing/workers.js'
import type { WatchListener } from '../src/testing/workers.js'

/** The newest date the installed workerd supports, as Wrangler's own Miniflare says. */
const supported = String(
  createRequire(createRequire(import.meta.url).resolve('wrangler'))('miniflare')
    .supportedCompatibilityDate,
)

const configuration = `name = "foldkit-plus-stack"
main = "dist/worker.js"
no_bundle = true
compatibility_date = "${supported}"

[[d1_databases]]
binding = "DB"
database_name = "stack"
database_id = "00000000-0000-0000-0000-000000000000"
migrations_dir = "migrations"
`

/**
 * A Worker that answers `version`, its vars and secrets at `/env`, and
 * writes to its console at each level at `/log`.
 */
const source = (version: string) => `
export default {
  fetch: (request, env) => {
    const path = new URL(request.url).pathname
    if (path === '/log') {
      console.debug('a debug')
      console.info('an info')
      console.log('a log')
      console.warn('a warning')
      console.error('render failed:', new Error('boom'))
      return new Response('logged')
    }
    return path === '/env'
      ? Response.json({ GREETING: env.GREETING, TOKEN: env.TOKEN, ORIGIN: env.ORIGIN, NOTE: env.NOTE })
      : new Response('${version}')
  },
}
`

interface D1 {
  readonly prepare: (sql: string) => {
    readonly run: () => Promise<unknown>
    readonly all: () => Promise<{ readonly results: ReadonlyArray<unknown> }>
  }
}

interface Env {
  readonly DB: D1
  /** Bound only once a test's configuration adds it. */
  readonly SECOND: D1
}

const directories: Array<string> = []

/** A Worker's folder: its configuration, edited by `edit`, one migration, and its source. */
const project = async (edit: (toml: string) => string = toml => toml) => {
  const directory = await mkdtemp(join(tmpdir(), 'foldkit-plus-stack-'))
  directories.push(directory)
  await mkdir(join(directory, 'migrations'))
  await writeFile(
    join(directory, 'migrations', '0001_notes.sql'),
    'CREATE TABLE notes (id TEXT PRIMARY KEY);\n',
  )
  await writeFile(join(directory, 'wrangler.toml'), edit(configuration))
  await writeFile(join(directory, 'worker.ts'), source('one'))
  return {
    directory,
    wrangler: join(directory, 'wrangler.toml'),
    entry: join(directory, 'worker.ts'),
  }
}

/**
 * Writes `text` to `path` in one step. `writeFile` empties the file before it
 * writes, and a rebuild that reads it then sees an empty entry.
 */
const save = async (path: string, text: string) => {
  await writeFile(`${path}.next`, text)
  await rename(`${path}.next`, path)
}

afterAll(async () => {
  for (const directory of directories) await rm(directory, { recursive: true, force: true })
})

describe('a watched stack', () => {
  let stack: Stack<Env>
  let entry: string
  const answer = async (path = '/') => (await fetch(`${stack.origin}${path}`)).text()

  beforeAll(async () => {
    const worker = await project()
    entry = worker.entry
    stack = await Stack.start<Env>({
      ...worker,
      vars: { GREETING: 'hello' },
      secrets: { TOKEN: 'secret' },
    })
  }, 120_000)

  afterAll(() => stack?.stop(), 120_000)

  it('runs with the vars and secrets given', async () => {
    expect(JSON.parse(await answer('/env'))).toEqual({ GREETING: 'hello', TOKEN: 'secret' })
  })

  it('swaps a changed Worker in at the same origin, keeping D1, and refuses one that does not build or start', async () => {
    expect(await answer()).toBe('one')
    await (await stack.env()).DB.prepare("INSERT INTO notes (id) VALUES ('kept')").run()

    const outcomes: Array<string> = []
    await stack.watch(listener(outcomes))
    await save(entry, source('two'))
    await expect.poll(() => outcomes, { timeout: 20_000 }).toEqual(['swapped'])
    expect(await answer()).toBe('two')
    expect(await notes(stack)).toEqual([{ id: 'kept' }])

    await save(entry, `${source('three')}\nexport const broken = (`)
    await expect.poll(() => outcomes.length, { timeout: 20_000 }).toBe(2)
    expect(outcomes[1]).toMatch(/^refused: /)
    expect(await answer()).toBe('two')

    // Builds, but workerd refuses a named export that is not a handler.
    await save(entry, `${source('three')}\nexport const notAHandler = 1`)
    await expect.poll(() => outcomes.length, { timeout: 20_000 }).toBe(3)
    expect(outcomes[2]).toMatch(/^refused: .*notAHandler/s)
    expect(await answer()).toBe('two')
    expect(await notes(stack)).toEqual([{ id: 'kept' }])

    await save(entry, source('three'))
    await expect.poll(() => outcomes, { timeout: 20_000 }).toHaveLength(4)
    expect(outcomes[3]).toBe('swapped')
    expect(await answer()).toBe('three')
    expect(await notes(stack)).toEqual([{ id: 'kept' }])
  }, 120_000)

  it('keeps the running Worker through an entry emptied as it is saved', async () => {
    const worker = await project()
    const own = await Stack.start(worker)
    try {
      const outcomes: Array<string> = []
      await own.watch(listener(outcomes))
      await writeFile(worker.entry, '')
      await expect.poll(() => outcomes.length, { timeout: 20_000 }).toBe(1)
      expect(outcomes[0]).toMatch(/^refused: .*no code/)
      expect(await (await fetch(own.origin)).text()).toBe('one')
      await save(worker.entry, source('two'))
      await expect.poll(() => outcomes, { timeout: 20_000 }).toEqual([outcomes[0], 'swapped'])
      expect(await (await fetch(own.origin)).text()).toBe('two')
    } finally {
      await own.stop()
    }
  }, 120_000)

  it('rereads a changed configuration, migrating a database it adds, and refuses one it would not start', async () => {
    const worker = await project()
    const own = await Stack.start<Env>(worker)
    const env = async () => JSON.parse(await (await fetch(`${own.origin}/env`)).text())
    try {
      await (await own.env()).DB.prepare("INSERT INTO notes (id) VALUES ('kept')").run()
      const outcomes: Array<string> = []
      await own.watch(listener(outcomes))
      const second = `
[[d1_databases]]
binding = "SECOND"
database_name = "second"
database_id = "11111111-1111-1111-1111-111111111111"
migrations_dir = "migrations"

[vars]
NOTE = "from the configuration"
`
      // Saved, but says what it said: no swap. Kept apart from the next save, whose
      // outcome a swap of this one would precede.
      await save(worker.wrangler, `# unchanged\n${configuration}`)
      await new Promise(resolve => setTimeout(resolve, 300))
      await save(worker.wrangler, `${configuration}${second}`)
      await expect.poll(() => outcomes, { timeout: 20_000 }).toEqual(['swapped'])
      expect(await env()).toEqual({ NOTE: 'from the configuration' })
      expect(await notes(own)).toEqual([{ id: 'kept' }])
      expect(await notes(own, 'SECOND')).toEqual([])

      await save(
        worker.wrangler,
        `${configuration.replace(/compatibility_date = ".*"/, 'compatibility_date = "2999-01-01"')}${second}`,
      )
      await expect.poll(() => outcomes, { timeout: 20_000 }).toHaveLength(2)
      expect(outcomes[1]).toMatch(/^refused: .*supports up to/)

      // Read and validated, but workerd does not start with it.
      await save(
        worker.wrangler,
        `compatibility_flags = ["no_such_flag_253"]\n${configuration}${second}`,
      )
      await expect.poll(() => outcomes, { timeout: 20_000 }).toHaveLength(3)
      expect(outcomes[2]).toMatch(/^refused: .*no_such_flag_253/s)

      // A database whose migrations do not run on a fresh D1 is refused with the rest of the change.
      await mkdir(join(worker.directory, 'broken'))
      await writeFile(join(worker.directory, 'broken', '0001_broken.sql'), 'NOT SQL;\n')
      const broken = `
[[d1_databases]]
binding = "THIRD"
database_name = "third"
database_id = "22222222-2222-2222-2222-222222222222"
migrations_dir = "broken"
`
      await save(
        worker.wrangler,
        `${configuration}${broken}${second.replace('from the configuration', 'changed')}`,
      )
      await expect.poll(() => outcomes, { timeout: 20_000 }).toHaveLength(4)
      expect(outcomes[3]).toMatch(/^refused: D1_ERROR: near "NOT"/)
      expect(await env()).toEqual({ NOTE: 'from the configuration' })
      expect(await notes(own)).toEqual([{ id: 'kept' }])
    } finally {
      await own.stop()
    }
  }, 120_000)
})

/** The rows of `notes` in the D1 bound as `binding`, read through the bindings as they are now. */
const notes = async (stack: Stack<Env>, binding: 'DB' | 'SECOND' = 'DB') => {
  const env = await stack.env()
  return (await env[binding].prepare('SELECT id FROM notes').all()).results
}

/** A watch listener that records what it is told in `outcomes`. */
const listener = (outcomes: Array<string> = []): WatchListener => ({
  onSwap: () => outcomes.push('swapped'),
  onRefused: message => outcomes.push(`refused: ${message}`),
  onStopped: message => outcomes.push(`stopped: ${message}`),
})

describe("the Worker's console", () => {
  const levels = ['debug', 'info', 'log', 'warn', 'error'] as const
  const silenced = (level: (typeof levels)[number]) =>
    vi.spyOn(console, level).mockImplementation(() => {})
  /** Node's console, each method recording what it is given instead of printing. */
  const spied = () => ({
    debug: silenced('debug'),
    info: silenced('info'),
    log: silenced('log'),
    warn: silenced('warn'),
    error: silenced('error'),
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints each line by its level, an error with its stack, and keeps each for logs() once', async () => {
    const printed = spied()
    const stack = await Stack.start(await project())
    try {
      expect(await (await fetch(`${stack.origin}/log`)).text()).toBe('logged')
      const taken: Array<{ level: string; message: string }> = []
      await expect
        .poll(() => {
          taken.push(...stack.logs().map(({ level, message }) => ({ level, message })))
          return taken.length
        })
        .toBe(5)
      expect(taken.slice(0, 4)).toEqual([
        { level: 'debug', message: 'a debug' },
        { level: 'info', message: 'an info' },
        { level: 'log', message: 'a log' },
        { level: 'warn', message: 'a warning' },
      ])
      expect(taken[4]).toEqual({
        level: 'error',
        message: expect.stringMatching(/^render failed: Error: boom\n\s+at .*worker\.js/),
      })
      expect(stack.logs()).toEqual([])
      for (const [level, line] of [
        ['debug', '[worker] a debug'],
        ['info', '[worker] an info'],
        ['log', '[worker] a log'],
        ['warn', '[worker] a warning'],
        ['error', `[worker] ${taken[4]!.message}`],
      ] as const)
        expect(printed[level].mock.calls).toEqual([[line]])
    } finally {
      await stack.stop()
    }
  }, 60_000)

  it('prints nothing when quiet, and still keeps each line', async () => {
    const printed = spied()
    const stack = await Stack.start({ ...(await project()), console: 'quiet' })
    try {
      await fetch(`${stack.origin}/log`)
      const taken: Array<unknown> = []
      await expect
        .poll(() => {
          taken.push(...stack.logs())
          return taken.length
        })
        .toBe(5)
      for (const level of levels) expect(printed[level]).not.toHaveBeenCalled()
    } finally {
      await stack.stop()
    }
  }, 60_000)

  it('prints what the Worker wrote just before the stack stopped', async () => {
    const printed = spied()
    const stack = await Stack.start(await project())
    await fetch(`${stack.origin}/log`)
    await stack.stop()
    expect(printed.log.mock.calls).toEqual([['[worker] a log']])
    expect(stack.logs()).toHaveLength(5)
  }, 60_000)

  it('prints what a Worker that does not start wrote', async () => {
    const printed = spied()
    const worker = await project()
    await writeFile(
      worker.entry,
      `console.error('no start:', new Error('at load'))
throw new Error('at load')
${source('one')}`,
    )
    await expect(Stack.start(worker)).rejects.toThrow()
    expect(printed.error.mock.calls.flat().join('\n')).toMatch(
      /\[worker\] no start: Error: at load/,
    )
  }, 60_000)
})

describe('vars of the origin', () => {
  it('reach the Worker as the origin it answers at, from the first request', async () => {
    const stack = await Stack.start({
      ...(await project()),
      vars: origin => ({ ORIGIN: origin, GREETING: 'hello' }),
    })
    try {
      expect(await (await fetch(`${stack.origin}/env`)).json()).toEqual({
        ORIGIN: stack.origin,
        GREETING: 'hello',
      })
    } finally {
      await stack.stop()
    }
  }, 60_000)
})

describe('stopping', () => {
  /** A plugin that tells where the stack bundles, and runs `onSetup` on each build it joins. */
  const probe = (onSetup: (call: number) => void = () => {}) => {
    const seen = { directory: '', calls: 0 }
    const plugin: Plugin = {
      name: 'probe',
      setup: build => {
        seen.calls++
        seen.directory = build.initialOptions.outdir ?? ''
        onSetup(seen.calls)
      },
    }
    return { seen, plugin }
  }
  const exists = (path: string) =>
    access(path).then(
      () => true,
      () => false,
    )

  it('stops workerd and removes the bundle after a watch that failed', async () => {
    const worker = await project()
    const { seen, plugin } = probe(call => {
      // The stack's own build is the first call; the watch's context the second.
      if (call === 2) throw new Error('setup failed')
    })
    const stack = await Stack.start({ ...worker, plugins: [plugin] })
    const origin = stack.origin
    expect(await exists(seen.directory)).toBe(true)
    await expect(stack.watch(listener())).rejects.toThrow('setup failed')
    // Not watching after all, so a second watch is not refused.
    await stack.watch(listener())
    await stack.stop()
    await expect(fetch(origin)).rejects.toThrow()
    expect(await exists(seen.directory)).toBe(false)
  }, 60_000)

  it('stops while a watch that will fail is still opening', async () => {
    const worker = await project()
    const { seen, plugin } = probe(call => {
      if (call === 2) throw new Error('setup failed')
    })
    const stack = await Stack.start({ ...worker, plugins: [plugin] })
    const watched = expect(stack.watch(listener())).rejects.toThrow('setup failed')
    await stack.stop()
    await watched
    expect(await exists(seen.directory)).toBe(false)
  }, 60_000)

  it('swaps nothing and reports nothing for a rebuild in flight when it stops', async () => {
    const worker = await project()
    let reach = () => {}
    let release = () => {}
    const gate = {
      hold: false,
      reached: new Promise<void>(resolve => (reach = resolve)),
      released: new Promise<void>(resolve => (release = resolve)),
    }
    const holding: Plugin = {
      name: 'gate',
      setup: build =>
        build.onEnd(async () => {
          if (!gate.hold) return
          reach()
          await gate.released
        }),
    }
    const stack = await Stack.start({ ...worker, plugins: [holding] })
    const outcomes: Array<string> = []
    await stack.watch(listener(outcomes))
    gate.hold = true
    await writeFile(worker.entry, source('two'))
    await gate.reached
    const stopped = stack.stop()
    release()
    await stopped
    // A second stop is the first one.
    await stack.stop()
    expect(outcomes).toEqual([])
  }, 60_000)
})

describe('the configuration', () => {
  const outcome = async (edit: (toml: string) => string) => {
    const worker = await project(edit)
    return Stack.start(worker).then(
      async stack => {
        await stack.stop()
        return 'started'
      },
      (error: Error) => error.message,
    )
  }

  // Started here rather than in a hook, so that a stack that does not start fails a test.
  it('starts the bundled Worker at the newest date workerd supports', async () => {
    expect(await outcome(toml => toml)).toBe('started')
  }, 60_000)

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
  ] as const)(
    'refuses %s',
    async (_, find, replace, message) => {
      expect(await outcome(toml => toml.replace(find, replace))).toMatch(message)
    },
    60_000,
  )
})

describe('the deploy bundle', () => {
  it('is written where main says', async () => {
    const worker = await project()
    await Stack.writeBundle(worker)
    expect(await readFile(join(worker.directory, 'dist', 'worker.js'), 'utf8')).toContain(
      'new Response("one")',
    )
  })
})

describe('a peer that is not installed', () => {
  it('names the subpath and what to install', async () => {
    // A name in a variable: a literal one would be a type error, as nothing declares it.
    const missing = 'foldkit-missing-239'
    await expect(
      peer('testing/workers', missing, () => import(/* @vite-ignore */ missing)),
    ).rejects.toThrow(
      'foldkit-plus/testing/workers needs `foldkit-missing-239`, which is not installed. ' +
        'Add it as a dev dependency: pnpm add -D foldkit-missing-239',
    )
  })

  it.each([
    [
      'a package of its own missing',
      Object.assign(new Error("Cannot find package 'miniflare' imported from wrangler/cli.js"), {
        code: 'ERR_MODULE_NOT_FOUND',
      }),
    ],
    ['a failure as it loads', new Error("'wrangler' threw as it loaded")],
  ])('leaves %s as it was', async (_, failure) => {
    await expect(peer('testing/workers', 'wrangler', () => Promise.reject(failure))).rejects.toBe(
      failure,
    )
  })
})
