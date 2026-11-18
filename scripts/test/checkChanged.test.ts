// @vitest-environment node
/**
 * What `check:changed` runs for a change set: which project holds a file, which
 * projects depend on it, and the steps and the reasons for skipping the rest.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { plan } from '../check-changed.mjs'
import {
  changedFiles,
  projectOf,
  referenceGraph,
  root,
  withDependents,
} from '../changed-projects.mjs'

const file = (path: string, exists = true) => ({ path, exists })
const stepNames = (
  changes: ReadonlyArray<{ path: string; exists: boolean }>,
  projects: string[] = [],
) =>
  plan({ files: changes, projects, browser: false, dependents: false, port: 0 }).steps.map(
    step => step.name,
  )

test.each([
  ['packages/mixins/src/theme/tokens.ts', 'packages/mixins'],
  ['packages/mixins/test/a.test.ts', 'packages/mixins'],
  ['examples/foldkit/todo/src/main.ts', 'examples/foldkit/todo'],
  ['scripts/mutate.mjs', undefined],
  ['package.json', undefined],
])('%s belongs to project %s', (path, project) => {
  expect(projectOf(path)).toBe(project)
})

test('a project’s dependents are every project that references it, however far', () => {
  const graph = new Map([
    ['a', []],
    ['b', ['a']],
    ['c', ['b']],
    ['d', ['x']],
  ])
  expect(withDependents(['a'], graph)).toEqual(['a', 'b', 'c'])
  expect(withDependents(['d'], graph)).toEqual(['d'])
})

test('the real reference graph links a package to what builds on it', () => {
  const graph = referenceGraph()
  expect(graph.get('packages/mixins-ui')).toContain('packages/mixins')
  expect(withDependents(['packages/mixins'])).toContain('packages/mixins-ui')
})

test('a docs-only change set runs only docs-check', () => {
  const { steps, skipped } = plan({
    files: [file('README.md'), file('docs/state-model.md'), file('packages/remote/README.md')],
    projects: [],
    browser: true,
    dependents: false,
    port: 1,
  })
  expect(steps.map(step => step.args.join(' '))).toEqual(['scripts/docs-check.mjs'])
  expect(skipped.map(skip => skip.why).join()).toMatch(/only docs changed/)
})

test('code runs a typecheck and the related unit tests, never the browser tests unless asked', () => {
  const changes = [file('packages/mixins/src/a.ts'), file('packages/mixins/src/gone.ts', false)]
  const names = stepNames(changes, ['packages/mixins'])
  expect(names).toEqual(['typecheck:fast packages/mixins', 'unit tests related to 1 files'])
  const unit = plan({
    files: changes,
    projects: ['packages/mixins'],
    browser: false,
    dependents: false,
    port: 0,
  })
  const related = unit.steps[1]!.args
  expect(related).toContain('packages/mixins/src/a.ts')
  expect(related).not.toContain('packages/mixins/src/gone.ts')
  expect(related).not.toContain('browser')
  expect(unit.skipped.map(skip => skip.name)).toEqual(
    expect.arrayContaining(['browser tests', 'e2e', 'dependent projects']),
  )

  const withBrowser = plan({
    files: changes,
    projects: ['packages/mixins'],
    browser: true,
    dependents: false,
    port: 4321,
  })
  expect(withBrowser.steps[2]!.args).toEqual(
    expect.arrayContaining(['browser', '--browser.api.port=4321']),
  )
})

test('a changed script also runs the scripts tests that name it', () => {
  const { steps } = plan({
    files: [file('scripts/mutate.mjs')],
    projects: [],
    browser: false,
    dependents: false,
    port: 0,
  })
  const related = steps.find(step => step.name.startsWith('unit tests'))!.args
  expect(related).toContain('scripts/test/mutate.test.ts')
})

test('nothing changed runs nothing', () => {
  expect(stepNames([])).toEqual([])
})

const stray = `scripts/test/fixture/untracked-${process.pid}.ts`
afterAll(() => rmSync(join(root, stray), { force: true }))

test('an untracked file is a changed file', () => {
  writeFileSync(join(root, stray), 'export {}\n')
  expect(changedFiles().find(change => change.path === stray)).toEqual({
    path: stray,
    exists: true,
  })
  rmSync(join(root, stray))
  expect(changedFiles().some(change => change.path === stray)).toBe(false)
})
