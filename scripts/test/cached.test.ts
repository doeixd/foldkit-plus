// @vitest-environment node
/**
 * `scripts/cached.mjs`: a pass is skipped until a named input, the command or
 * the lockfile changes; a failure is never stored; an unrelated file changes
 * nothing. The inputs are untracked files in a folder of their own, which
 * `git status` reports and a blob listing does not.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeEach, expect, test } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const fixture = `scripts/test/fixture/cached-${process.pid}`
const inputs = join(root, fixture)
const unrelated = join(root, `scripts/test/fixture/cached-other-${process.pid}.txt`)
const cache = mkdtempSync(join(tmpdir(), 'foldkit-cached-'))
const exit = 'scripts/test/fixture/exit.mjs'

afterAll(() => {
  rmSync(inputs, { recursive: true, force: true })
  rmSync(unrelated, { force: true })
  rmSync(cache, { recursive: true, force: true })
})
beforeEach(() => {
  rmSync(inputs, { recursive: true, force: true })
  rmSync(join(cache, 'probe.json'), { force: true })
  mkdirSync(inputs, { recursive: true })
  writeFileSync(join(inputs, 'in.txt'), 'one\n')
})

const cached = (
  flags: ReadonlyArray<string> = [],
  env: Record<string, string> = {},
  command: ReadonlyArray<string> = ['node', exit],
  paths: ReadonlyArray<string> = [fixture],
) => {
  const result = spawnSync(
    'node',
    ['scripts/cached.mjs', 'probe', ...flags, '--inputs', ...paths, '--', ...command],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, FOLDKIT_CACHE_DIR: cache, FIXTURE_EXIT: '0', ...env },
    },
  )
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}
const skipped = (output: string) => /^skipped: probe unchanged since /m.test(output)
const stored = () => JSON.parse(readFileSync(join(cache, 'probe.json'), 'utf8')) as { key: string }

test('a pass is stored, and the next run with the same inputs is skipped', () => {
  const first = cached()
  expect(first.status).toBe(0)
  expect(first.output).toMatch(/ran: probe passed/)
  const second = cached()
  expect(second.status).toBe(0)
  expect(skipped(second.output)).toBe(true)
  expect(second.output).toContain(stored().key)
})

test('editing an input runs it again', () => {
  cached()
  writeFileSync(join(inputs, 'in.txt'), 'two\n')
  expect(skipped(cached().output)).toBe(false)
})

test('a new untracked file within the inputs runs it again, and its removal does too', () => {
  cached()
  writeFileSync(join(inputs, 'new.txt'), 'x\n')
  const added = cached()
  expect(skipped(added.output)).toBe(false)
  rmSync(join(inputs, 'new.txt'))
  const removed = cached()
  expect(skipped(removed.output)).toBe(false)
  expect(skipped(cached().output)).toBe(true)
})

test('a file outside the inputs changes nothing', () => {
  cached()
  writeFileSync(unrelated, 'noise\n')
  expect(skipped(cached().output)).toBe(true)
})

test('a changed command runs again', () => {
  cached()
  expect(skipped(cached([], {}, ['node', exit, 'extra']).output)).toBe(false)
})

test('a failure is not stored, and drops a pass stored for the same key', () => {
  const failed = cached([], { FIXTURE_EXIT: '3' })
  expect(failed.status).toBe(3)
  expect(failed.output).toMatch(/FAILED, exit 3/)
  expect(() => stored()).toThrow()
  expect(cached().status).toBe(0)
  // The same inputs failing under --no-cache contradicts the stored pass.
  expect(cached(['--no-cache'], { FIXTURE_EXIT: '3' }).status).toBe(3)
  expect(() => stored()).toThrow()
})

test('--no-cache and FOLDKIT_NO_CACHE=1 run despite a stored pass', () => {
  cached()
  expect(skipped(cached(['--no-cache']).output)).toBe(false)
  expect(skipped(cached([], { FOLDKIT_NO_CACHE: '1' }).output)).toBe(false)
  expect(skipped(cached().output)).toBe(true)
})

test('inputs that match no file are refused rather than cached', () => {
  const none = cached([], {}, ['node', exit], ['scripts/test/fixture/no-such-folder'])
  expect(none.status).toBe(2)
  expect(none.output).toMatch(/no file matches/)
  const unnamed = spawnSync('node', ['scripts/cached.mjs', 'probe', '--', 'node', exit], {
    cwd: root,
    encoding: 'utf8',
  })
  expect(unnamed.status).toBe(2)
})
