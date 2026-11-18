/**
 * `pnpm lint:cached [name...]`: the slow, pure, repo-wide checks, each through
 * `scripts/cached.mjs`, so one that already passed on these inputs is skipped.
 * With names, only those. Each runs in turn and is reported as ran or
 * skipped; the exit status is 1 if any failed. The originals (`pnpm
 * tags:check` ...) stay exact and uncached: this is the same command line
 * behind a key.
 *
 * `inputs` is every file the check reads, taken from the script. `code` is
 * `packages` and `examples`, which the checks walk or build programs over;
 * the lockfile and the Node major are in every key already.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const code = ['packages', 'examples']
const config = ['package.json', 'tsconfig.json', 'tsconfig.base.json', 'pnpm-workspace.yaml']

/** Name -> the package script it runs, and what it reads. */
export const checks = {
  paths: { script: 'paths:check', inputs: [...code, ...config, 'scripts/workspace-paths.mjs', '.oxfmtrc.jsonc'] },
  icons: { script: 'icons:check', inputs: [...code, 'scripts/icons.mjs', '.oxfmtrc.jsonc', 'package.json'] },
  tags: { script: 'tags:check', inputs: [...code, ...config, 'scripts/tags-check.mjs', 'scripts/programs.mjs'] },
  rtl: { script: 'rtl:check', inputs: [...code, 'scripts/rtl-check.mjs'] },
  writes: { script: 'writes:check', inputs: [...code, ...config, 'scripts/writes-check.mjs', 'scripts/programs.mjs'] },
  evidence: { script: 'evidence:check', inputs: [...code, 'scripts', 'scripts/evidence-check.mjs'] },
  mutate: { script: 'mutate:check', inputs: [...code, 'scripts', ...config] },
  // Reads every document, builds against every package, and runs tsc.
  docs: { script: 'docs:check', inputs: ['.'] },
  // Every ts, json and yaml file, and the formatter's config.
  format: { script: 'format:check', inputs: ['.'] },
}

/** The `cached.mjs` arguments for one check. */
export const argumentsFor = name => {
  const { script, inputs } = checks[name]
  return ['scripts/cached.mjs', script, '--inputs', ...inputs, '--', 'pnpm', '-s', script]
}

const main = () => {
  const named = process.argv.slice(2)
  const unknown = named.filter(name => !Object.hasOwn(checks, name))
  if (unknown.length > 0) {
    console.error(`lint:cached: no check named ${unknown.join(', ')}; known: ${Object.keys(checks).join(', ')}`)
    return 2
  }
  const names = named.length === 0 ? Object.keys(checks) : named
  const results = names.map(name => {
    console.log(`\n== ${name}`)
    const started = Date.now()
    const result = spawnSync('node', argumentsFor(name), { cwd: root, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] })
    process.stdout.write(result.stdout)
    const status = result.status ?? 1
    const ran = !/^skipped: /m.test(result.stdout)
    return { name, status, ran, seconds: (Date.now() - started) / 1000 }
  })
  console.log('\nlint:cached summary')
  for (const { name, status, ran, seconds } of results) {
    const verdict = status !== 0 ? 'FAIL   ' : ran ? 'ran    ' : 'skipped'
    console.log(`  ${verdict} ${name} (${seconds.toFixed(1)}s)`)
  }
  return results.some(result => result.status !== 0) ? 1 : 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
