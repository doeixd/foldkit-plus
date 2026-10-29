/**
 * Follows `npx foldkit-plus setup` the way a user on npm meets it, against the
 * packed tarballs (#200, #205, #229). Run after `pnpm pack`, which leaves each
 * tarball beside its manifest; everything not ours comes from the registry.
 *
 * 1. The CLI from its tarball, alone, beneath an ancestor `node_modules/effect`
 *    that throws when loaded: npx with `--legacy-peer-deps` installs no peer,
 *    and Node would walk up to it.
 * 2. In an empty folder the guide prints the scaffold command: run it for ssr
 *    with npm, as printed.
 * 3. In the scaffold, every npm step the guide prints: the `package.json`
 *    fields, the install line, then each adapter's line. Each must exit 0 with
 *    no ERESOLVE, even as a warning, and leave one `effect` and one `foldkit`,
 *    with nothing of Effect's, Foldkit's or ours that `npm ls` calls invalid.
 *
 * A step names our packages bare; this runs it with each one's tarball, and
 * points every other reference to one of ours at its tarball with `overrides`,
 * so an unpublished version resolves.
 *
 *   node scripts/published-setup.mjs [tarball-dir]
 */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Each of our packages' name, to its tarball. */
const tarballs = new Map()
const given = process.argv[2]
if (given === undefined) {
  for (const dir of readdirSync(join(root, 'packages'))) {
    const manifest = join(root, 'packages', dir, 'package.json')
    if (!existsSync(manifest)) continue
    const { name, version, private: unpublished } = JSON.parse(readFileSync(manifest, 'utf8'))
    if (unpublished) continue
    const file = join(root, 'packages', dir, `${name}-${version}.tgz`)
    if (!existsSync(file)) throw new Error(`${file} is missing: run pnpm pack first`)
    tarballs.set(name, file)
  }
} else {
  for (const file of readdirSync(given)) {
    const named = /^(.+)-\d+\.\d+\.\d+.*\.tgz$/.exec(file)
    if (named !== null) tarballs.set(named[1], join(given, file))
  }
}
if (!tarballs.has('foldkit-plus')) throw new Error('No foldkit-plus tarball')

const work = mkdtempSync(join(tmpdir(), 'foldkit-plus-setup-'))
const home = join(work, 'home')
// A new user's cache: nothing installed by an earlier run is reused.
const env = {
  ...process.env,
  npm_config_cache: join(work, 'npm-cache'),
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_update_notifier: 'false',
}

const fail = message => {
  console.error(`published-setup: ${message}\n(left in ${work})`)
  process.exit(1)
}

/** Runs a shell command, as a user would type it, and returns its output. */
const run = (command, cwd) => {
  const result = spawnSync(command, { cwd, env, shell: true, encoding: 'utf8' })
  return {
    status: result.status,
    stdout: result.stdout,
    output: `${result.stdout}${result.stderr}`,
  }
}

// 1. The CLI, unpacked as npx would leave it but with nothing beside it.
const tools = join(home, 'tools')
mkdirSync(tools, { recursive: true })
copyFileSync(tarballs.get('foldkit-plus'), join(tools, 'plus.tgz'))
if (run('tar -xzf plus.tgz', tools).status !== 0) fail('could not unpack foldkit-plus')
mkdirSync(join(tools, 'node_modules'))
renameSync(join(tools, 'package'), join(tools, 'node_modules', 'foldkit-plus'))
const cli = join(tools, 'node_modules', 'foldkit-plus', 'dist', 'cli.mjs')

const stranger = join(home, 'node_modules', 'effect')
mkdirSync(stranger, { recursive: true })
writeFileSync(
  join(stranger, 'package.json'),
  JSON.stringify({ name: 'effect', version: '3.19.8', type: 'module', exports: './index.js' }),
)
writeFileSync(join(stranger, 'index.js'), "throw new Error('the ancestor effect was loaded')\n")

const setup = cwd => {
  const result = spawnSync(process.execPath, [cli, 'setup'], { cwd, encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout.startsWith('# Foldkit Plus'))
    fail(`setup failed in ${cwd}:\n${result.stdout}${result.stderr}`)
  return result.stdout
}

// 2. The scaffold.
const empty = join(home, 'new')
mkdirSync(empty)
const scaffold = setup(empty)
  .split('\n')
  .find(line =>
    /^npx create-foldkit-app@\S+ .*--rendering <ssg\|ssr> --package-manager npm$/.test(line),
  )
if (scaffold === undefined) fail('the guide prints no ssr scaffold command for npm')
const created = run(scaffold.replace('<name>', 'app').replace('<ssg|ssr>', 'ssr'), empty)
if (created.status !== 0) fail(`${scaffold} failed:\n${created.output}`)
const app = join(empty, 'app')

// 3. The guide's npm steps.
const guide = setup(app)
const install = guide.split('\n## 3.')[0].split('\n## 2. Install\n')[1]
if (install === undefined) fail('the guide has no install step')
const fields = /```json\n([\s\S]*?)\n```/.exec(install)
const commands = [
  ...install.matchAll(/^(npm install [^`\n]+)$/gm),
  ...install.matchAll(/`(npm install foldkit-[^`]+)`/g),
].map(match => match[1])
if (commands.length < 2) fail(`the install step names too few npm commands:\n${install}`)

const manifestPath = join(app, 'package.json')
const readManifest = () => JSON.parse(readFileSync(manifestPath, 'utf8'))
if (fields !== null)
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...readManifest(), ...JSON.parse(fields[1]) }, null, 2),
  )
const ownOverrides = readManifest().overrides ?? {}

const direct = new Set()
for (const command of commands) {
  const words = command.split(' ')
  for (const word of words) if (tarballs.has(word)) direct.add(word)
  // npm refuses an override of a direct dependency, so ours that are, or
  // become so here, are installed by tarball instead.
  const manifest = readManifest()
  manifest.overrides = {
    ...ownOverrides,
    ...Object.fromEntries(
      [...tarballs]
        .filter(([name]) => !direct.has(name))
        .map(([name, file]) => [name, `file:${file}`]),
    ),
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const local = words
    .map(word => (tarballs.has(word) ? `"file:${tarballs.get(word)}"` : word))
    .join(' ')
  const installed = run(local, app)
  if (installed.status !== 0 || installed.output.includes('ERESOLVE'))
    fail(`${command} failed (exit ${installed.status}):\n${installed.output}`)
  // Only what Effect, Foldkit and ours meet counts: a library an adapter brings
  // may leave an unrelated optional peer of its own unmet (i18next's TypeScript).
  const listed = JSON.parse(run('npm ls --all --json', app).stdout)
  const problems = (listed.problems ?? []).filter(problem =>
    /^\w+: (?:effect|@effect\/[^@\s]+|foldkit[^@\s]*|@foldkit\/[^@\s]+)@/.test(problem),
  )
  if (problems.length > 0) fail(`npm ls refuses the tree after ${command}:\n${problems.join('\n')}`)
  const versions = new Map()
  const walk = node => {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      if (name === 'effect' || name === 'foldkit')
        versions.set(name, new Set([...(versions.get(name) ?? []), child.version]))
      walk(child)
    }
  }
  walk(listed)
  for (const [name, found] of versions)
    if (found.size !== 1) fail(`after ${command} the tree holds ${name} ${[...found].join(', ')}`)
  console.log(`published-setup: ${command}`)
}

rmSync(work, { recursive: true, force: true })
console.log(`published-setup: npm runs every step setup prints, for an ssr scaffold`)
