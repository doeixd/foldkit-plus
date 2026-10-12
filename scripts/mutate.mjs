/**
 * `pnpm mutate <spec>...`: checks that the tests named for each declared
 * mutation fail when it is applied. A spec is a module next to the tests
 * (`test/<area>.mutations.ts`) whose default export lists mutations:
 *
 *   { name, edits: [{ file, find, replace, all? }], tests: [paths], survives? }
 *
 * `file` is relative to the spec; `tests` are Vitest filters from the repo
 * root. Each `find` must occur exactly once in its file (every time with
 * `all`), and must change it. The tests run once unmutated first, and must
 * pass. Each mutation is applied in memory by the plugin in
 * `vitest.shared.ts`, never to the file, so a crash leaves nothing mutated.
 *
 * A mutation is killed when a test fails with the same tests collected,
 * survived when every test passes, invalid when the run broke otherwise (a
 * module that no longer loads, a different collection), and not applied
 * when no module it edits was loaded. Anything but killed fails the run,
 * except a mutation that says why it survives (`survives: 'reason'`).
 * `--only <name>` runs one mutation. `--check` runs nothing: it checks every
 * spec's anchors and tests (or those of the specs named) and lists every
 * problem, which CI does, since the mutations themselves are too slow to.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
// One directory per run, so two runs at once do not read each other's reports.
const work = join(root, '.tsbuild', 'mutate', String(process.pid))

const fail = message => {
  console.error(`pnpm mutate: ${message}`)
  rmSync(work, { recursive: true, force: true })
  process.exit(2)
}

/**
 * A spec's mutations, checked against their files and tests before anything
 * runs, with every problem found rather than the first.
 */
const load = async path => {
  const absolute = resolve(path)
  const problems = []
  const { default: mutations } = await import(pathToFileURL(absolute).href)
  if (!Array.isArray(mutations) || mutations.length === 0) {
    return { mutations: [], problems: [`${path} exports no mutations`] }
  }
  const checked = mutations.map(mutation => {
    const { name, edits, tests, survives } = mutation ?? {}
    const where = `${path}: ${typeof name === 'string' ? name : '(unnamed)'}`
    if (typeof name !== 'string' || name === '') problems.push(`${where}: a mutation needs a name`)
    if (!Array.isArray(tests) || tests.length === 0 || !tests.every(test => typeof test === 'string')) {
      problems.push(`${where}: name the tests that should fail`)
    } else {
      // A test file renamed away leaves the mutation nothing to fail.
      for (const test of tests)
        if (!existsSync(resolve(root, test))) problems.push(`${where}: the test ${test} does not exist`)
    }
    if (survives !== undefined && (typeof survives !== 'string' || survives === '')) {
      problems.push(`${where}: say why it survives`)
    }
    if (!Array.isArray(edits) || edits.length === 0) {
      problems.push(`${where}: no edits`)
      return { name, edits: [], tests, survives }
    }
    const applied = edits.flatMap(edit => {
      const { file, find, replace, all = false } = edit ?? {}
      if (typeof file !== 'string' || typeof find !== 'string' || typeof replace !== 'string') {
        problems.push(`${where}: an edit needs a file, a find and a replace`)
        return []
      }
      const target = resolve(dirname(absolute), file)
      if (!existsSync(target)) {
        problems.push(`${where}: ${file} does not exist`)
        return []
      }
      const source = readFileSync(target, 'utf8')
      const count = source.split(find).length - 1
      if (count === 0) problems.push(`${where}: the anchor is not in ${file}: ${JSON.stringify(find)}`)
      if (count > 1 && !all)
        problems.push(`${where}: the anchor occurs ${count} times in ${file}; pass all: true or narrow it`)
      if (find === replace) problems.push(`${where}: the edit changes nothing`)
      return [{ file: target, find, replace, all }]
    })
    return { name, edits: applied, tests, survives }
  })
  return { mutations: checked, problems }
}

/** Every spec in the repository, as git knows them. */
const everySpec = () => {
  const listed = spawnSync('git', ['ls-files', '*.mutations.ts', '*.mutations.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (listed.status !== 0) fail(`git ls-files failed:\n${listed.stderr}`)
  return listed.stdout.split('\n').filter(Boolean)
}

/** One Vitest run of `tests`, with the JSON report it wrote. */
const run = (tests, env) => {
  mkdirSync(work, { recursive: true })
  const report = join(work, 'report.json')
  rmSync(report, { force: true })
  const result = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', ...tests, '--reporter=json', `--outputFile=${report}`],
    { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', shell: process.platform === 'win32' },
  )
  const json = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : undefined
  const cases = json?.testResults.flatMap(suite => suite.assertionResults) ?? []
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    collected: new Set(cases.map(test => test.fullName)),
    failed: cases.filter(test => test.status === 'failed').map(test => test.fullName),
  }
}

const sameSet = (a, b) => a.size === b.size && [...a].every(item => b.has(item))

/** What a mutated run says of the mutation, against the run without it. */
const outcomeOf = (edits, applied, result, baseline) => {
  if (applied.size < edits.length) return 'not applied'
  // A different collection is a module that broke, not a test that caught it.
  if (!sameSet(result.collected, baseline.collected)) return 'invalid'
  if (result.failed.length > 0) return 'killed'
  return result.status === 0 ? 'survived' : 'invalid'
}

/** Why the line says what it says: which test killed it, or why it may survive. */
const reasonOf = ({ mutation, outcome, failed }) => {
  if (outcome === 'killed') return `by ${failed[0]}${failed.length > 1 ? ` and ${failed.length - 1} more` : ''}`
  if (outcome === 'survived' && mutation.survives !== undefined) return `as declared: ${mutation.survives}`
  return ''
}

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined
const checkOnly = args.includes('--check')
const named = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--only')

// `--check`: every anchor and test of every spec (or of those named), and no
// test run, so a spec whose code moved under it says so before anyone needs it.
if (checkOnly) {
  const specs = named.length === 0 ? everySpec() : named
  const loaded = await Promise.all(specs.map(load))
  const problems = loaded.flatMap(spec => spec.problems)
  for (const problem of problems) console.error(`pnpm mutate: ${problem}`)
  const count = loaded.reduce((sum, spec) => sum + spec.mutations.length, 0)
  console.log(
    problems.length === 0
      ? `${specs.length} specs, ${count} mutations: every anchor and test found`
      : `\n${problems.length} problems in ${specs.length} specs`,
  )
  process.exit(problems.length === 0 ? 0 : 1)
}

if (named.length === 0) fail('name a spec: pnpm mutate <path/to/area.mutations.ts>')
const loaded = await Promise.all(named.map(load))
const [problem] = loaded.flatMap(spec => spec.problems)
if (problem !== undefined) fail(problem)
const mutations = loaded.flatMap(spec => spec.mutations).filter(m => only === undefined || m.name === only)
if (mutations.length === 0) fail(`no mutation named ${only}`)

// A mutation killed by a test that was already red proves nothing.
const baselines = new Map()
for (const tests of new Set(mutations.map(m => JSON.stringify(m.tests)))) {
  const baseline = run(JSON.parse(tests), {})
  if (baseline.status !== 0 || baseline.collected.size === 0) {
    fail(`the tests do not pass unmutated (${tests}):\n${baseline.output.slice(-2000)}`)
  }
  baselines.set(tests, baseline)
}

const results = mutations.map(mutation => {
  const marker = join(work, 'applied.txt')
  rmSync(marker, { force: true })
  const result = run(mutation.tests, {
    FOLDKIT_MUTATION: JSON.stringify(mutation.edits),
    FOLDKIT_MUTATION_MARKER: marker,
  })
  const applied = existsSync(marker) ? new Set(readFileSync(marker, 'utf8').split('\n').filter(Boolean)) : new Set()
  const outcome = outcomeOf(mutation.edits, applied, result, baselines.get(JSON.stringify(mutation.tests)))
  const expected = mutation.survives === undefined ? outcome === 'killed' : outcome === 'survived'
  return { mutation, outcome, expected, failed: result.failed, output: result.output }
})

for (const result of results) {
  const mark = result.expected ? 'ok  ' : 'FAIL'
  console.log(`${mark} ${result.mutation.name}: ${result.outcome} ${reasonOf(result)}`.trimEnd())
}
const unexpected = results.filter(result => !result.expected)
for (const { mutation, outcome, output } of unexpected.filter(r => r.outcome === 'invalid')) {
  console.log(`\n${mutation.name} (${outcome}):\n${output.slice(-1500)}`)
}
console.log(`\n${results.length - unexpected.length} of ${results.length} as expected`)
rmSync(work, { recursive: true, force: true })
process.exit(unexpected.length === 0 ? 0 : 1)
