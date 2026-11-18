/**
 * `pnpm check:changed`: the inner loop in one command. It reads what the
 * working tree changed (`git status`, plus `--since <ref>` for what differs
 * from that ref), prints what it will run and what it skips and why, runs it,
 * and ends with a summary and a real exit status.
 *
 *   --dry          print the plan and run nothing
 *   --since <ref>  count what differs from <ref>... as changed too
 *   --dependents   also typecheck the projects that reference a changed one
 *   --browser      also run the browser tests related to the change, on a
 *                  free port (or $FOLDKIT_BROWSER_PORT)
 *
 * The steps: a fast typecheck (`typecheck:fast`, a look: `tsc -b` decides) of
 * the changed projects, then the unit tests related to the changed files
 * (`vitest related`, no module cache). Changes under `scripts/` also run the
 * `scripts/test` files that name the script. A change set of docs alone
 * (`*.md`, `docs/**`) runs only `docs-check`. End-to-end tests never run here.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { changedProjects, root } from './changed-projects.mjs'

const CODE = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'])

const isDoc = path => path.endsWith('.md') || path.startsWith('docs/')

/** The `scripts/test` files that name a changed script, by its file name. */
const testsNaming = (scriptPaths, tests) =>
  tests.filter(test => {
    const text = readFileSync(join(root, test), 'utf8')
    return scriptPaths.some(path => text.includes(basename(path)))
  })

/**
 * The steps for a change set: `{ name, command, args }` to run, and
 * `{ name, why }` for what is left out.
 */
export const plan = ({ files, projects, browser, dependents, since, port }) => {
  const steps = []
  const skipped = []
  const present = files.filter(file => file.exists).map(file => file.path)
  if (files.length === 0) return { steps, skipped: [{ name: 'everything', why: 'nothing changed' }] }

  if (files.every(file => isDoc(file.path))) {
    steps.push({ name: 'docs:check', command: 'node', args: ['scripts/docs-check.mjs'] })
    skipped.push({ name: 'typecheck and tests', why: 'only docs changed' })
    return { steps, skipped }
  }

  if (projects.length > 0) {
    steps.push({
      name: `typecheck:fast ${projects.join(' ')}`,
      command: 'node',
      args: ['scripts/typecheck-fast.mjs', ...projects],
    })
  } else {
    skipped.push({ name: 'typecheck:fast', why: 'no changed file is inside a TypeScript project' })
  }
  if (!dependents) {
    skipped.push({ name: 'dependent projects', why: 'pass --dependents to typecheck the projects that reference a changed one' })
  }

  const code = present.filter(path => CODE.has(extname(path)))
  const scripts = code.filter(path => path.startsWith('scripts/') && !path.startsWith('scripts/test/'))
  const scriptTests =
    scripts.length === 0
      ? []
      : testsNaming(
          scripts,
          readdirSync(join(root, 'scripts', 'test'))
            .filter(name => name.endsWith('.test.ts'))
            .map(name => `scripts/test/${name}`),
        )
  const related = [...new Set([...code, ...scriptTests])]
  if (related.length > 0) {
    steps.push({
      name: `unit tests related to ${related.length} files`,
      command: 'npx',
      args: ['vitest', 'related', ...related, '--run', '--project', 'unit', '--passWithNoTests', '--fsModuleCache=false'],
    })
    if (browser) {
      steps.push({
        name: `browser tests related to ${related.length} files (port ${port})`,
        command: 'npx',
        args: ['vitest', 'related', ...related, '--run', '--project', 'browser', '--passWithNoTests', '--fsModuleCache=false', `--browser.api.port=${port}`],
      })
    } else {
      skipped.push({ name: 'browser tests', why: 'pass --browser to run them' })
    }
  } else {
    skipped.push({ name: 'tests', why: 'no changed source or test file' })
  }
  skipped.push({ name: 'e2e', why: 'never run here: pnpm e2e' })
  if (files.some(file => file.path.endsWith('.md'))) {
    steps.push({ name: 'docs:check', command: 'node', args: ['scripts/docs-check.mjs'] })
  }
  return { steps, skipped }
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const run = ({ command, args }) => {
  const windows = process.platform === 'win32'
  const quoted = windows ? args.map(arg => (/[\s"]/.test(arg) ? `"${arg}"` : arg)) : args
  const started = Date.now()
  const result = spawnSync(command, quoted, { cwd: root, stdio: 'inherit', shell: windows })
  return { status: result.status ?? 1, seconds: (Date.now() - started) / 1000 }
}

const main = async () => {
  const args = process.argv.slice(2)
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined
  const dependents = args.includes('--dependents')
  const browser = args.includes('--browser')
  const { files, projects } = changedProjects({ since, dependents })
  const port = browser ? Number(process.env['FOLDKIT_BROWSER_PORT'] ?? (await freePort())) : 0
  const { steps, skipped } = plan({ files, projects, browser, dependents, since, port })

  console.log(`check:changed: ${files.length} changed files, ${projects.length} projects`)
  for (const step of steps) console.log(`  run   ${step.name}`)
  for (const skip of skipped) console.log(`  skip  ${skip.name}: ${skip.why}`)
  if (args.includes('--dry')) return 0

  const results = steps.map(step => {
    console.log(`\n== ${step.name}`)
    return { step, ...run(step) }
  })
  console.log('\ncheck:changed summary')
  for (const { step, status, seconds } of results) {
    console.log(`  ${status === 0 ? 'ok  ' : 'FAIL'} ${step.name} (${seconds.toFixed(1)}s, exit ${status})`)
  }
  console.log('  typecheck:fast is a look; `pnpm typecheck` decides.')
  return results.some(result => result.status !== 0) ? 1 : 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main())
}
