// @vitest-environment node
/**
 * `pnpm mutate` on a fixture: it refuses a spec it cannot apply before
 * running anything, refuses a red baseline, and sorts each mutation into
 * killed, survived, invalid or not applied, without touching the file.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, expect, test } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const fixture = (file: string) =>
  resolve(import.meta.dirname, 'fixture', file)
    .split('\\')
    .join('/')
const sum = fixture('sum.ts')
const tests = ['scripts/test/fixture/sum.test.ts']
const directory = mkdtempSync(join(tmpdir(), 'foldkit-mutate-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

/** Runs the runner over a spec of `mutations`; its exit status and what it printed. */
const mutate = (
  name: string,
  mutations: ReadonlyArray<unknown>,
  env: Record<string, string> = {},
) => {
  const spec = join(directory, `${name}.mutations.mjs`)
  writeFileSync(spec, `export default ${JSON.stringify(mutations)}\n`)
  const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/mutate.mjs', spec], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}
const edit = (find: string, replace: string, file = sum) => ({ file, find, replace })

test.each([
  ['an anchor that is not there', edit('a * b', 'a - b'), /the anchor is not in/],
  ['an edit that changes nothing', edit('a + b', 'a + b'), /changes nothing/],
  ['a file that does not exist', edit('a + b', 'a - b', fixture('gone.ts')), /does not exist/],
])(
  'refuses %s before running anything',
  (_, wrong, message) => {
    const { status, output } = mutate('refused', [{ name: 'wrong', edits: [wrong], tests }])
    expect(status).toBe(2)
    expect(output).toMatch(message)
    expect(output).not.toMatch(/as expected/)
  },
  60_000,
)

test('refuses an anchor found twice unless told to take every one', () => {
  const twice = edit('a', 'c')
  const { status, output } = mutate('twice', [{ name: 'twice', edits: [twice], tests }])
  expect(status).toBe(2)
  expect(output).toMatch(/occurs \d+ times/)
}, 60_000)

test('refuses to judge mutations against tests already red', () => {
  const { status, output } = mutate(
    'red',
    [{ name: 'flip', edits: [edit('a + b', 'a - b')], tests }],
    { FIXTURE_RED: '1' },
  )
  expect(status).toBe(2)
  expect(output).toMatch(/do not pass unmutated/)
}, 120_000)

test('sorts each mutation, and leaves the file as it was', () => {
  const before = readFileSync(sum, 'utf8')
  const { status, output } = mutate('sorted', [
    { name: 'flips the sign', edits: [edit('a + b', 'a - b')], tests },
    {
      name: 'reorders the sum',
      edits: [edit('a + b', 'b + a')],
      tests,
      survives: 'addition commutes',
    },
    { name: 'reorders it undeclared', edits: [edit('a + b', 'b + a')], tests },
    { name: 'breaks the module', edits: [edit('a + b', 'a +')], tests },
    { name: 'edits a file no test loads', edits: [edit('= 1', '= 2', fixture('other.ts'))], tests },
  ])
  expect(status).toBe(1)
  expect(output).toMatch(/ok {3}flips the sign: killed by/)
  expect(output).toMatch(/ok {3}reorders the sum: survived as declared: addition commutes/)
  expect(output).toMatch(/FAIL reorders it undeclared: survived/)
  expect(output).toMatch(/FAIL breaks the module: invalid/)
  expect(output).toMatch(/FAIL edits a file no test loads: not applied/)
  expect(output).toMatch(/2 of 5 as expected/)
  expect(readFileSync(sum, 'utf8')).toBe(before)
}, 300_000)
