/**
 * `Cms.historyCard` writes one text wherever it is rendered: its dates follow
 * the locale and zone it is given, not the runtime's. Each render runs in a
 * child process, since a process cannot change its own default locale.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

interface Rendered {
  readonly locale: string
  readonly timeZone: string
  readonly html: string
}

const renderUnder = (zone: string, locale: string): Rendered => {
  const run = spawnSync(process.execPath, [join(here, 'historyChild.mjs')], {
    env: { ...process.env, TZ: zone, LANG: locale, LC_ALL: locale },
    encoding: 'utf8',
    timeout: 60_000,
  })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`history child failed: ${run.stderr.slice(-2000)}`)
  return JSON.parse(run.stdout) as Rendered
}

it('writes the same History under two default locales and zones', context => {
  // Both ends of the date line, so a day or hour read in the runtime's zone moves.
  const left = renderUnder('Pacific/Kiritimati', 'C.UTF-8')
  const right = renderUnder('Pacific/Honolulu', 'de_DE.UTF-8')
  expect(left.timeZone).not.toBe(right.timeZone)
  // Windows Node reads its default locale from the system, not the environment.
  if (left.locale === right.locale) {
    context.skip('one default locale on this platform; the environment cannot vary it')
    return
  }
  expect(left.html).toContain('Sep 27, 2026 · 11:30 PM')
  expect(right.html).toBe(left.html)
}, 120_000)
