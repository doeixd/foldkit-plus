/**
 * S6: a render must not depend on where it runs. The example has met both a
 * build-time clock and a runtime time zone in its dates before; this pins
 * the whole class. Every page is rendered three ways in this process — twice
 * under one time zone (catches the build clock, random values, anything that
 * moves between runs) and once under two others at both extremes of the date
 * line (catches an ambient time zone) — and every page is rendered under two
 * default locales in child processes (catches an ambient locale, which a
 * process cannot change for itself). All equal, or the build is refused.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { generateSite, siteTemplate } from '../src/ssr/prerender.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', '..')
const template = siteTemplate(readFileSync(join(here, '..', 'index.html'), 'utf8'))

// The build's clock, fixed for every render: only ambient reads (a live
// `Date.now`, `Math.random`) may still move the output, and those are what
// this check exists to catch.
const now = new Date('2026-10-01T12:00:00.000Z')

const zone = process.env['TZ']
afterEach(() => {
  if (zone === undefined) delete process.env['TZ']
  else process.env['TZ'] = zone
})

interface Rendered {
  readonly path: string
  readonly html: string
}

/** Every page rendered from the seed under `tz`, in this process. */
const generateAt = async (tz: string): Promise<ReadonlyArray<Rendered>> => {
  process.env['TZ'] = tz
  vi.stubEnv('FOLDKIT_BUILD_ID', 'test-build')
  try {
    return await generateSite(template, now)
  } finally {
    vi.unstubAllEnvs()
  }
}

/** The first difference between two pages, or none when they are identical. */
const difference = (path: string, left: string, right: string): string | null => {
  if (left === right) return null
  let at = 0
  while (at < left.length && at < right.length && left[at] === right[at]) at++
  const context = (text: string) => JSON.stringify(text.slice(Math.max(0, at - 80), at + 80))
  return `${path} differs at character ${at}: ${context(left)} vs ${context(right)}`
}

/** Every page of `next` identical to the same path of `prev`, naming the first gap. */
const expectSamePages = (
  prev: ReadonlyArray<Rendered>,
  next: ReadonlyArray<Rendered>,
  label: string,
) => {
  expect(next.map(page => page.path)).toEqual(prev.map(page => page.path))
  for (const page of prev) {
    const other = next.find(each => each.path === page.path)
    if (other === undefined) throw new Error(`${label}: ${page.path} was not rendered again`)
    const gap = difference(page.path, page.html, other.html)
    if (gap !== null) throw new Error(`${label}: ${gap}`)
  }
}

it('renders every page identically twice in a row', async () => {
  const first = await generateAt('UTC')
  const second = await generateAt('UTC')
  // A render of nothing proves nothing: the seed publishes pages and posts.
  expect(first.length).toBeGreaterThan(5)
  expectSamePages(first, second, 'a second render')
}, 240_000)

it('renders every page identically in other time zones', async () => {
  const utc = await generateAt('UTC')
  // Both extremes of the date line: a day read in the runtime's zone moves
  // in at least one of them, whatever hour the fixtures name.
  const kiritimati = await generateAt('Pacific/Kiritimati')
  const honolulu = await generateAt('Pacific/Honolulu')
  expect(utc.length).toBeGreaterThan(5)
  expectSamePages(utc, kiritimati, 'Pacific/Kiritimati')
  expectSamePages(utc, honolulu, 'Pacific/Honolulu')
}, 240_000)

/** This process's default locale under `env`: the locale leg's establishment probe. */
const localeUnder = (env: NodeJS.ProcessEnv): string => {
  const run = spawnSync(
    process.execPath,
    ['-e', 'console.log(new Intl.DateTimeFormat().resolvedOptions().locale)'],
    { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 30_000 },
  )
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`locale probe failed: ${run.stderr.slice(-500)}`)
  return run.stdout.trim()
}

interface ChildRender {
  readonly locale: string
  readonly pages: ReadonlyArray<Rendered>
}

/** Every page rendered in a child process under `env` (a default locale no process sets for itself). */
const renderUnder = (env: NodeJS.ProcessEnv): ChildRender => {
  const tsx =
    process.platform === 'win32'
      ? join(root, 'node_modules', '.bin', 'tsx.cmd')
      : join(root, 'node_modules', '.bin', 'tsx')
  const run = spawnSync(tsx, [join(here, 'determinismChild.ts')], {
    cwd: join(root, 'examples', 'cms'),
    env: {
      ...process.env,
      FOLDKIT_BUILD_ID: 'test-build',
      DETERMINISM_NOW: now.toISOString(),
      TZ: 'UTC',
      ...env,
    },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 240_000,
  })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0)
    throw new Error(`determinism child failed: ${(run.stderr as string).slice(-2000)}`)
  return JSON.parse(run.stdout as string) as ChildRender
}

it('renders every page identically under two default locales', context => {
  const english = { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }
  const german = { LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8' }
  // Windows Node reads the default locale from the system, not the
  // environment: where the probe cannot establish two locales the comparison
  // would pass for the wrong reason, so the leg skips loudly instead.
  if (localeUnder(english) === localeUnder(german)) {
    context.skip(
      'one default locale on this platform; the locale leg runs where the environment varies it',
    )
    return
  }
  const left = renderUnder(english)
  const right = renderUnder(german)
  expect(left.locale).not.toBe(right.locale)
  expectSamePages(left.pages, right.pages, `${right.locale} against ${left.locale}`)
}, 240_000)
