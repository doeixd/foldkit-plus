// @vitest-environment node
/**
 * The CLI as npx runs it: built by this package's own config, then started in
 * an empty folder whose ancestor holds an `effect` that is not ours. With
 * `--legacy-peer-deps` npx installs no peers, Node walks up to that ancestor,
 * and an Effect 3 there crashed the CLI before it printed anything (#200).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'tsdown'
import { afterAll, expect, test } from 'vitest'
import configs from '../tsdown.config.js'

const packageDir = resolve(import.meta.dirname, '..')
const root = mkdtempSync(join(tmpdir(), 'foldkit-plus-cli-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

test('the built CLI prints its guide beneath an ancestor `effect` it must not load', async () => {
  const cli = [configs].flat().find(config => config.entry?.toString() === 'src/cli.ts')
  if (cli === undefined) throw new Error('tsdown.config.ts has no build of src/cli.ts')
  // The package as npx unpacks it: its manifest beside the built CLI.
  const installed = join(root, 'node_modules', 'foldkit-plus')
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
  const empty = join(root, 'empty')
  mkdirSync(empty)

  const run = spawnSync(process.execPath, [join(installed, 'dist', 'cli.mjs'), 'setup'], {
    cwd: empty,
    encoding: 'utf8',
  })
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
  expect(run.stdout).toMatch(/^# Foldkit Plus \d+\.\d+\.\d+: setup/)
}, 120_000)
