// @vitest-environment node
/**
 * The CLI as npx runs it: built by this package's own config, then started
 * in folders whose ancestor holds an `effect` that is not ours. With
 * `--legacy-peer-deps` npx installs no peers, Node walks up to that ancestor,
 * and an Effect 3 there crashed the CLI before it printed anything (#200).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'tsdown'
import { afterAll, beforeAll, expect, test } from 'vitest'
import configs from '../tsdown.config.js'

const packageDir = resolve(import.meta.dirname, '..')
const root = mkdtempSync(join(tmpdir(), 'foldkit-plus-cli-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

// The package as npx unpacks it: its manifest beside the built CLI.
const installed = join(root, 'node_modules', 'foldkit-plus')
const run = (folder: string, args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [join(installed, 'dist', 'cli.mjs'), ...args], {
    cwd: folder,
    encoding: 'utf8',
  })

beforeAll(async () => {
  const cli = [configs].flat().find(config => config.entry?.toString() === 'src/cli.ts')
  if (cli === undefined) throw new Error('tsdown.config.ts has no build of src/cli.ts')
  await build({
    ...cli,
    config: false,
    cwd: packageDir,
    outDir: join(installed, 'dist'),
    logLevel: 'silent',
  })
  copyFileSync(join(packageDir, 'package.json'), join(installed, 'package.json'))
  // The ancestor's `effect`, which throws if anything imports it.
  const stranger = join(root, 'node_modules', 'effect')
  mkdirSync(stranger, { recursive: true })
  writeFileSync(
    join(stranger, 'package.json'),
    JSON.stringify({ name: 'effect', version: '3.19.8', type: 'module', exports: './index.js' }),
  )
  writeFileSync(join(stranger, 'index.js'), "throw new Error('the ancestor effect was loaded')\n")
  // A project with one package installed, and its README.
  const app = join(root, 'app')
  const remote = join(app, 'node_modules', 'foldkit-remote')
  mkdirSync(remote, { recursive: true })
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({ name: 'app', dependencies: { 'foldkit-remote': '2.0.0' } }),
  )
  writeFileSync(
    join(remote, 'package.json'),
    JSON.stringify({ name: 'foldkit-remote', version: '2.0.0' }),
  )
  writeFileSync(join(remote, 'README.md'), '# Remote\n\n## Preloading\n\nCall `Data.preload`.\n')
}, 120_000)

test('the built CLI prints its guide beneath an ancestor `effect` it must not load', () => {
  const empty = join(root, 'empty')
  mkdirSync(empty)
  const setup = run(empty, ['setup'])
  expect(setup.stderr).toBe('')
  expect(setup.status).toBe(0)
  expect(setup.stdout).toMatch(/^# Foldkit Plus \d+\.\d+\.\d+: setup/)
})

test('the built CLI answers from the installed docs, and fails on nothing found', () => {
  const app = join(root, 'app')
  const found = run(app, ['docs', 'Data.preload'])
  expect(found.stderr).toBe('')
  expect(found.status).toBe(0)
  expect(found.stdout).toContain('From foldkit-remote@2.0.0 README.md › Remote › Preloading')

  const json = JSON.parse(run(app, ['docs', 'preloading', '--json']).stdout)
  expect(json.sections[0]).toMatchObject({ source: 'foldkit-remote@2.0.0 README.md', line: 3 })

  const missing = run(app, ['docs', 'zebra'])
  expect(missing.status).toBe(1)
  expect(missing.stderr).toContain('matches "zebra"')

  const unknown = run(app, ['docs', '--list', 'mirror'])
  expect(unknown.status).toBe(1)
  expect(unknown.stderr).toContain('The topics are: remote.')
})

// A project with no `tsx` anywhere above it (the temporary folder's ancestors hold none): the
// module loads through Node's own TypeScript support, and `foldkit-entity` is the project's.
const lawsApp = () => {
  const app = join(root, 'laws-app')
  const entity = join(app, 'node_modules', 'foldkit-entity')
  mkdirSync(entity, { recursive: true })
  writeFileSync(
    join(entity, 'package.json'),
    JSON.stringify({
      name: 'foldkit-entity',
      type: 'module',
      exports: { '.': { import: './index.js' } },
    }),
  )
  writeFileSync(
    join(entity, 'index.js'),
    'export const Laws = { show: report => `stub shows ${report.findings.length} findings`, check: () => ({ pairs: [], arrows: [], states: [], findings: [] }) }\n',
  )
  writeFileSync(
    join(app, 'report.ts'),
    "const findings: ReadonlyArray<{ readonly _tag: string }> = [{ _tag: 'Unreached' }]\nexport const report = { pairs: [], arrows: [], states: [], findings }\n",
  )
  writeFileSync(join(app, 'neither.ts'), 'export default 3\n')
  writeFileSync(
    join(app, 'imports.ts'),
    "import { report } from './report.js'\nexport default report\n",
  )
  return app
}

test('the built CLI prints a report through Node alone, and a report with findings still exits 0', () => {
  const printed = run(lawsApp(), ['laws', 'report.ts#report'])
  expect(printed.stdout).toBe('stub shows 1 findings\n')
  expect(printed.status).toBe(0)
})

test('without tsx, a `.js` specifier for a `.ts` file fails with the advice to install it', () => {
  const failed = run(lawsApp(), ['laws', 'imports.ts'])
  expect(failed.status).toBe(1)
  expect(failed.stderr).toContain("with Node's own TypeScript support")
  expect(failed.stderr).toContain('npm install --save-dev tsx')
})

test('a module of neither shape exits 1 and says what it found; no module is a usage error', () => {
  const neither = run(lawsApp(), ['laws', 'neither.ts'])
  expect(neither.status).toBe(1)
  expect(neither.stderr).toContain('The default export of')
  expect(neither.stderr).toContain('is number')
  const usage = run(lawsApp(), ['laws'])
  expect(usage.status).toBe(1)
  expect(usage.stderr).toContain('npx foldkit-plus laws <module>')
})

test("the built CLI prints the writes example's report, through the tsx the repository holds", () => {
  const kept = readFileSync(join(packageDir, '../../examples/writes/LAWS.md'), 'utf8')
  const printed = run(resolve(packageDir, '../..'), ['laws', 'examples/writes/src/laws.ts#report'])
  expect(printed.stderr).toBe('')
  expect(printed.stdout).toBe(`${/```text\n([\s\S]*?)\n```/.exec(kept)![1]}\n`)
  expect(printed.status).toBe(0)
})
