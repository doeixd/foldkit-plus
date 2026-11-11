// @vitest-environment node
/**
 * `pnpm tags:check`'s reach into a tag read into a variable: each source below is
 * compiled on its own, so the checker tells `string` from a union of literals.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error the checker is plain JavaScript
import { check } from '../tags-check.mjs'
// @ts-expect-error the compiler API of TypeScript 6, which TypeScript 7 no longer ships
import ts from 'typescript-6'
import { afterAll, expect, test } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'tags-check-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const prelude = `
type Read = { readonly _tag: 'Ready' } | { readonly _tag: 'Failed' } | { readonly _tag: 'Loading' }
type Loose = { readonly _tag: string }
declare const read: Read
declare const loose: Loose
declare const one: (model: number) => Read
declare const looseOf: (model: number) => Loose
`

let count = 0
const findingsOf = (body: string): string[] => {
  const file = join(dir, `case${count++}.ts`)
  writeFileSync(file, `${prelude}${body}\nexport {}\n`)
  const program = ts.createProgram({
    rootNames: [file],
    options: { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, types: [] },
  })
  const found: string[] = []
  check(program, [file], found)
  return found
}

const refused: ReadonlyArray<readonly [string, string, string]> = [
  [
    'a tag held as a string and compared',
    'const tag = loose._tag\nexport const a = tag === "Ready"',
    'tag held as string',
  ],
  [
    'a let initialised from a tag',
    'let tag = loose._tag\nexport const a = tag !== "Ready"',
    'tag held as string',
  ],
  [
    'a function returning a tag',
    'const tagOf = (m: number) => looseOf(m)._tag\nexport const a = tagOf(1) === "Ready"',
    'tag held as string',
  ],
  [
    'a tag handed through a call',
    'const tagOf = (m: number) => Option.match(m, { onNone: () => "Initial", onSome: () => looseOf(m)._tag })\n' +
      'declare const Option: { match: <A>(a: number, f: { onNone: () => string; onSome: () => A }) => string }\n' +
      'export const a = tagOf(1) === "Ready"',
    'tag held as string',
  ],
  [
    'a parameter a tag is passed to',
    'const show = (tag: string) => tag === "Ready"\nexport const a = show(loose._tag)',
    'tag held as string',
  ],
  [
    'a parameter reached through another function',
    'const inner = (tag: string) => tag === "Ready"\nconst outer = (tag: string) => inner(tag)\nexport const a = outer(loose._tag)',
    'tag held as string',
  ],
  [
    'a held tag on the right of a comparison',
    'const tag = loose._tag\nexport const a = "Ready" === tag',
    'tag held as string',
  ],
  [
    'a function declaration returning a tag from a block',
    'function tagOf(m: number) {\n  return looseOf(m)._tag\n}\nexport const a = tagOf(1) === "Ready"',
    'tag held as string',
  ],
  [
    'a tag chosen by a ternary',
    'declare const flag: boolean\nconst tag = flag ? loose._tag : "Initial"\nexport const a = tag === "Ready"',
    'tag held as string',
  ],
  [
    'an else-if chain on a held tag, once',
    'const tag = read._tag\nexport const a = (): number => {\n  if (tag === "Ready") return 1\n  else if (tag === "Failed") return 2\n  else return 3\n}',
    'if/else on a held tag',
  ],
  [
    'a ternary on a held tag of literals',
    'const tag = read._tag\nexport const a = tag === "Ready" ? 1 : 2',
    'ternary on a held tag',
  ],
  [
    'an if/else on a held tag of literals',
    'const tag = read._tag\nexport const a = (): number => {\n  if (tag === "Ready") return 1\n  else return 2\n}',
    'if/else on a held tag',
  ],
  [
    'sibling ifs on a held tag',
    'const tag = read._tag\nexport const a = (): number => {\n  if (tag === "Ready") return 1\n  if (tag === "Failed") return 2\n  return 3\n}',
    '2 ifs on tag',
  ],
  [
    'a switch on a held tag with a catch-all',
    'const tag = read._tag\nexport const a = (): number => {\n  switch (tag) {\n    case "Ready": return 1\n    default: return 2\n  }\n}',
    'switch on tag misses',
  ],
]

test.each(refused)('refuses %s', (_name, body, what) => {
  const found = findingsOf(body)
  expect(found).toHaveLength(1)
  expect(found[0]).toContain(what)
})

const kept: ReadonlyArray<readonly [string, string]> = [
  [
    'a single comparison of a held tag of literals',
    'const tag = read._tag\nexport const a = tag === "Ready"',
  ],
  [
    'a held tag narrowed once with an early return',
    'const tag = read._tag\nexport const a = (): number => {\n  if (tag === "Ready") return 1\n  return 2\n}',
  ],
  [
    'a function returning a tag of literals, compared once',
    'const tagOf = (m: number) => one(m)._tag\nexport const a = tagOf(1) === "Ready"',
  ],
  [
    'an exhaustive switch on a held tag',
    'const tag = read._tag\nexport const a = (): number => {\n  switch (tag) {\n    case "Ready": return 1\n    case "Failed": return 2\n    case "Loading": return 3\n  }\n}',
  ],
  [
    'a variable that is not a tag',
    'const name = "Ready" as string\nexport const a = name === "Ready" ? 1 : 2',
  ],
  [
    'a parameter no tag reaches',
    'const show = (tag: string) => tag === "Ready" ? 1 : 2\nexport const a = show("Ready")',
  ],
  [
    'a function that asks a question of a tag',
    'declare const tags: Set<string>\nconst isKnown = (m: number) => tags.has(looseOf(m)._tag)\nexport const a = isKnown(1) === true ? 1 : 2',
  ],
  [
    'a mark above a statement that spans lines',
    'const tag = loose._tag\n// tag-check: open, any application\'s Message\nexport const a =\n  tag === "Ready" ||\n  tag === "Failed"',
  ],
  [
    'a field called _tag that holds an object',
    'declare const holder: { readonly _tag: { readonly x: number } }\nconst held = holder._tag\nexport const a = held === held ? 1 : 2',
  ],
  [
    'a held tag marked open',
    'const tag = loose._tag\n// tag-check: open, another application\'s Message\nexport const a = tag === "Ready"',
  ],
  [
    'a boolean made from a tag',
    'const ready = read._tag === "Ready"\nexport const a = ready ? 1 : 2',
  ],
]

test.each(kept)('keeps %s', (_name, body) => {
  expect(findingsOf(body)).toEqual([])
})

test('the CMS site view as it was before 1a943d9 is refused throughout', () => {
  const found = findingsOf(`
type Option<A> = { readonly value?: A }
declare const Option: { match: <A, B>(o: Option<A>, f: { onNone: () => B; onSome: (a: A) => B }) => B }
declare const pageRead: (m: number) => Option<{ readonly read: (m: number) => Loose }>
const nothing = (model: number, tag: string, missing: string): string =>
  tag === 'Ready' || tag === 'NotFound' ? missing : pending(tag)
const pending = (tag: string): string => (tag === 'Failed' ? 'failed' : 'loading')
const tagOf = (read: Option<{ readonly read: (m: number) => Loose }>, model: number): string =>
  Option.match(read, { onNone: () => 'Initial', onSome: shown => shown.read(model)._tag })
export const page = (model: number) => nothing(model, tagOf(pageRead(model), model), 'none')
`)
  expect(found.map(line => line.replace(/^\S+  /, '').split(':')[0])).toEqual([
    'ternary on a held tag',
    'tag held as string',
    'tag held as string',
    'ternary on a held tag',
    'tag held as string',
  ])
})
