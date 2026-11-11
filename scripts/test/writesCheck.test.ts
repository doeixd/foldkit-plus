// @vitest-environment node
/**
 * `pnpm writes:check`: each source below is compiled beside a stand-in for the
 * surface package's `Focus` and `WritableProjection`, which the check finds by
 * the interface and the file that declares it, as it finds the real ones.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
// @ts-expect-error the checker is plain JavaScript
import { check } from '../writes-check.mjs'
// @ts-expect-error the compiler API of TypeScript 6, which TypeScript 7 no longer ships
import ts from 'typescript-6'
import { afterAll, expect, test } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'writes-check-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

mkdirSync(join(dir, 'packages/surface/src'), { recursive: true })
writeFileSync(
  join(dir, 'packages/surface/src/index.ts'),
  `export interface Focus<Root, Value> {
  readonly get: (root: Root) => Value
  readonly set: (root: Root, value: Value) => Root
  readonly modify: (root: Root, fn: (value: Value) => Value) => Root
}
export interface WritableProjection<Model, Shared> {
  readonly get: (model: Model) => Shared
  readonly set: (model: Model, shared: Shared) => Model
}
`,
)
// An interface of the same name anywhere else is another type.
writeFileSync(
  join(dir, 'lookalike.ts'),
  `export interface Focus<Root, Value> {
  readonly set: (root: Root, value: Value) => Root
}
`,
)

const prelude = `
import type { Focus, WritableProjection } from './packages/surface/src/index.ts'
import type { Focus as Lookalike } from './lookalike.ts'
declare const focus: Focus<{ n: number }, number>
declare const projection: WritableProjection<{ n: number }, { n: number }>
declare const lookalike: Lookalike<{ n: number }, number>
declare const model: { n: number }
`

let count = 0
const findingsOf = (body: string, allow: boolean = false): string[] => {
  const file = join(dir, `case${count++}.ts`)
  writeFileSync(file, `${prelude}${body}\nexport {}\n`)
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      allowImportingTsExtensions: true,
      types: [],
    },
  })
  const found: string[] = []
  check(program, [file], found, allow ? [relativeToRoot(file)] : [])
  return found.map(line => line.replace(/^\S+:/, ''))
}
// The check names a file by its path from the repository root.
const relativeToRoot = (file: string): string =>
  relative(fileURLToPathRoot, file).replaceAll('\\', '/')
const fileURLToPathRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')

const marked = (why: string): string => `// write: infrastructure — ${why}`

const refused: ReadonlyArray<readonly [string, string, string]> = [
  ['Focus.set called', 'export const a = focus.set(model, 1)', 'Focus.set'],
  ['Focus.modify called', 'export const a = focus.modify(model, n => n + 1)', 'Focus.modify'],
  [
    'WritableProjection.set called',
    'export const a = projection.set(model, { n: 1 })',
    'WritableProjection.set',
  ],
  ['Focus.set handed on as a value', 'export const a = [focus.set]', 'Focus.set'],
  ['Focus.set read through brackets', 'export const a = focus["set"](model, 1)', 'Focus.set'],
  ['Focus.set destructured', 'export const { set } = focus', 'Focus.set'],
  [
    'Focus.modify destructured under another name',
    'export const { modify: change } = focus',
    'Focus.modify',
  ],
  [
    'a marker with no reason',
    '// write: infrastructure\nexport const a = focus.set(model, 1)',
    'a marker needs a reason',
  ],
  [
    'a marker with a dash and nothing after',
    '// write: infrastructure —\nexport const a = focus.set(model, 1)',
    'a marker needs a reason',
  ],
  [
    'a marker two lines above',
    `${marked('restore')}\n\nexport const a = focus.set(model, 1)`,
    'Focus.set',
  ],
  [
    'a marker of another kind',
    '// physical: a pixel offset\nexport const a = focus.set(model, 1)',
    'Focus.set',
  ],
]

test.each(refused)('refuses %s', (_name, body, what) => {
  const found = findingsOf(body)
  expect(found.length).toBeGreaterThan(0)
  expect(found.join('\n')).toContain(what)
})

const kept: ReadonlyArray<readonly [string, string]> = [
  ['a read', 'export const a = focus.get(model) + projection.get(model).n'],
  ['a Map set', 'export const a = new Map<string, number>().set("a", 1)'],
  [
    'a Set add and a Map delete',
    'export const a = [new Set<number>().add(1), new Map().delete(1)]',
  ],
  ['a lookalike Focus in another file', 'export const a = lookalike.set(model, 1)'],
  ['a plain object with a set member', 'export const a = { set: (n: number) => n }.set(1)'],
  ['a marked call on the line above', `${marked('restore')}\nexport const a = focus.set(model, 1)`],
  ['a marker at the end of the line', `export const a = focus.set(model, 1) ${marked('restore')}`],
  [
    'a marked statement spanning lines',
    `${marked('checkpoint')}\nexport const a = projection.set(\n  model,\n  { n: 1 },\n)`,
  ],
  [
    'a marked statement with the write on a later line',
    `${marked('checkpoint')}\nexport const a = [\n  projection.set(model, { n: 1 }),\n]`,
  ],
  ['a marked destructure', `${marked('restore')}\nexport const { set } = focus`],
]

test.each(kept)('keeps %s', (_name, body) => {
  expect(findingsOf(body)).toEqual([])
})

test('a module the check names as infrastructure is not read', () => {
  expect(findingsOf('export const a = focus.set(model, 1)', true)).toEqual([])
})

test('a marker covers its own statement only', () => {
  const found = findingsOf(
    `${marked('restore')}\nexport const a = focus.set(model, 1)\nexport const b = focus.set(model, 2)`,
  )
  expect(found).toHaveLength(1)
  expect(found[0]).toMatch(/^\d+  Focus\.set/)
})
