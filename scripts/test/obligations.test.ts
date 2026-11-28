/**
 * Every declared obligation and every discharge in the repository, in one
 * report that fails while one is open. A package adds to the shared registry
 * (`metakit/temporal`) from a file named `*.obligations.ts` in its `test`
 * folder; this test imports each and reads the registry. `foldkit-plus laws
 * <file>#report` prints the same list for one such file.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
// By path: the repository root has no `metakit` of its own. The registry is one per process, whichever copy adds to it.
import * as Temporal from '../../packages/metakit/src/temporal.js'

const root = join(import.meta.dirname, '..', '..')

/** The `*.obligations.ts` files in the `test` folder of each package and example, in a fixed order. */
const obligationFiles = (): ReadonlyArray<string> =>
  ['packages', 'examples', join('examples', 'foldkit')].flatMap(group =>
    readdirSync(join(root, group), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && existsSync(join(root, group, entry.name, 'test')))
      .flatMap(entry =>
        readdirSync(join(root, group, entry.name, 'test'), { recursive: true })
          .map(String)
          .filter(file => file.endsWith('.obligations.ts'))
          .map(file => join(root, group, entry.name, 'test', file)),
      ),
  )

test('no obligation is open and no decision is refuted, in any package of the repository', async () => {
  const files = obligationFiles()
  for (const file of files) await import(/* @vite-ignore */ file)
  const report = Temporal.registry.report()

  expect(
    report.open.map(
      ({ owner, obligation, where, why }) =>
        `${owner} ${obligation.name}, declared at ${where}: ${why}`,
    ),
  ).toEqual([])
  expect(
    report.refuted.map(({ owner, name, where }) => `${owner} ${name}, decided at ${where}`),
  ).toEqual([])
  expect(report.ok).toBe(true)

  // An empty glob would pass the lines above: at least the todo app's pairs are in.
  expect(files.some(file => file.includes('todo-app'))).toBe(true)
  expect(report.discharged.some(({ owner }) => owner === 'todo-app')).toBe(true)
}, 120_000)
