// @vitest-environment node
/**
 * The CLI as npx runs it: built by this package's own config, then started
 * in folders whose ancestor holds an `effect` that is not ours. With
 * `--legacy-peer-deps` npx installs no peers, Node walks up to that ancestor,
 * and an Effect 3 there crashed the CLI before it printed anything (#200).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
const run = (folder: string, args: ReadonlyArray<string>, input?: string) =>
  spawnSync(process.execPath, [join(installed, 'dist', 'cli.mjs'), ...args], {
    cwd: folder,
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
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

test('the built CLI serves the docs over MCP on stdio', () => {
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'search_docs', arguments: { query: 'preloading' } },
    },
  ]
  const served = run(
    join(root, 'app'),
    ['mcp'],
    lines.map(line => JSON.stringify(line)).join('\n') + '\n',
  )
  expect(served.stderr).toBe('')
  const replies = served.stdout
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  expect(replies.map(each => each.id)).toEqual([1, 2])
  expect(replies[1].result.isError).toBe(false)
  expect(replies[1].result.content[0].text).toContain('Call `Data.preload`.')
})
