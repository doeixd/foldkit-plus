// @vitest-environment node
/**
 * `pnpm mutate` on a fixture: it refuses a spec it cannot apply before
 * running anything, refuses a red baseline, and sorts each mutation into
 * killed, survived, invalid or not applied, without touching the file.
 */
import { execFile } from 'node:child_process'
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
  flags: ReadonlyArray<string> = [],
): Promise<{ readonly status: number | null; readonly output: string }> => {
  const spec = join(directory, `${name}.mutations.mjs`)
  writeFileSync(spec, `export default ${JSON.stringify(mutations)}\n`)
  // Fixture specs are plain `.mjs`, so invoke Node directly instead of `pnpm exec tsx`.
  return new Promise(done => {
    execFile(
      process.execPath,
      ['scripts/mutate.mjs', ...flags, spec],
      { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const status = error === null ? 0 : typeof error.code === 'number' ? error.code : null
        done({ status, output: `${stdout}${stderr}` })
      },
    )
  })
}
const edit = (find: string, replace: string, file = sum) => ({ file, find, replace })

test.concurrent.each([
  ['an anchor that is not there', edit('a * b', 'a - b'), /the anchor is not in/],
  ['an edit that changes nothing', edit('a + b', 'a + b'), /changes nothing/],
  ['a file that does not exist', edit('a + b', 'a - b', fixture('gone.ts')), /does not exist/],
])(
  'refuses %s before running anything',
  async (_, wrong, message) => {
    const { status, output } = await mutate(`refused-${Math.random().toString(36).slice(2)}`, [
      { name: 'wrong', edits: [wrong], tests },
    ])
    expect(status).toBe(2)
    expect(output).toMatch(message)
    expect(output).not.toMatch(/as expected/)
  },
  60_000,
)

test.concurrent('refuses an anchor found twice unless told to take every one', async () => {
  const twice = edit('a', 'c')
  const { status, output } = await mutate('twice', [{ name: 'twice', edits: [twice], tests }])
  expect(status).toBe(2)
  expect(output).toMatch(/occurs \d+ times/)
}, 60_000)

test.concurrent('checks every anchor and test without running one, and names each problem', async () => {
  const [{ status, output }, clean] = await Promise.all([
    mutate(
      'checked',
      [
        { name: 'gone anchor', edits: [edit('a * b', 'a - b')], tests },
        {
          name: 'gone test',
          edits: [edit('a + b', 'a - b')],
          tests: ['scripts/test/fixture/gone.test.ts'],
        },
        { name: 'fine', edits: [edit('a + b', 'a - b')], tests },
      ],
      {},
      ['--check'],
    ),
    mutate('clean', [{ name: 'fine', edits: [edit('a + b', 'a - b')], tests }], {}, ['--check']),
  ])
  expect(status).toBe(1)
  expect(output).toMatch(/gone anchor: the anchor is not in/)
  expect(output).toMatch(
    /gone test: the test scripts\/test\/fixture\/gone\.test\.ts does not exist/,
  )
  expect(output).toMatch(/2 problems in 1 specs/)
  expect(output).not.toMatch(/as expected|killed/)

  expect(clean.status).toBe(0)
  expect(clean.output).toMatch(/1 specs, 1 mutations: every anchor and test found/)
}, 60_000)

test.concurrent('--only is repeatable, runs just those, and refuses a name that is not there', async () => {
  const spec = [
    { name: 'flip,sign', edits: [edit('a + b', 'a - b')], tests },
    { name: 'breakit', edits: [edit('a + b', 'a +')], tests },
    { name: 'flipagain', edits: [edit('a + b', 'a * b')], tests },
  ]
  const [two, one, gone] = await Promise.all([
    mutate('only', spec, {}, ['--only', 'flip,sign', '--only', 'flipagain']),
    mutate('only-one', spec, {}, ['--only', 'breakit']),
    mutate('only-gone', spec, {}, ['--only', 'flipagain', '--only', 'nope']),
  ])
  expect(two.status).toBe(0)
  expect(two.output).toMatch(/ok {3}flip,sign: killed/)
  expect(two.output).toMatch(/ok {3}flipagain: killed/)
  expect(two.output).not.toMatch(/breakit/)
  expect(two.output).toMatch(/2 of 2 as expected/)

  expect(one.status).toBe(1)
  expect(one.output).toMatch(/FAIL breakit: invalid/)
  expect(one.output).toMatch(/0 of 1 as expected/)
  expect(one.output).not.toMatch(/flip/)

  expect(gone.status).toBe(2)
  expect(gone.output).toMatch(/no mutation named nope/)
  expect(gone.output).not.toMatch(/as expected/)
}, 300_000)

test.concurrent('refuses to judge mutations against tests already red', async () => {
  const { status, output } = await mutate(
    'red',
    [{ name: 'flip', edits: [edit('a + b', 'a - b')], tests }],
    { FIXTURE_RED: '1' },
  )
  expect(status).toBe(2)
  expect(output).toMatch(/do not pass unmutated/)
}, 120_000)

test.concurrent('sorts each mutation, and leaves the file as it was', async () => {
  const before = readFileSync(sum, 'utf8')
  const { status, output } = await mutate('sorted', [
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
