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
  [
    'a ternary on a direct tag',
    'export const a = read._tag === "Ready" ? 1 : 2',
    'ternary on a tag',
  ],
  [
    'a ternary on a direct tag with !==',
    'export const a = read._tag !== "Ready" ? 1 : 2',
    'ternary on a tag',
  ],
  [
    'a ternary with the literal on the left',
    'export const a = "Ready" === read._tag ? 1 : 2',
    'ternary on a tag',
  ],
  [
    'a ternary whose && holds a direct tag',
    'export const a = read._tag === "Ready" && one(1)._tag === "Failed" ? 1 : 2',
    'ternary on a tag',
  ],
  [
    'a ternary whose || holds a direct tag',
    'export const a = read._tag === "Ready" || read._tag === "Failed" ? 1 : 2',
    'ternary on a tag',
  ],
  [
    'an if/else on a direct tag',
    'export const a = (): number => {\n  if (read._tag === "Ready") {\n    return 1\n  } else {\n    return 2\n  }\n}',
    'if/else on a tag',
  ],
  [
    'an if/else with !== and &&',
    'export const a = (n: number): number => {\n  if (n > 0 && read._tag !== "Ready") {\n    return 1\n  } else {\n    return 2\n  }\n}',
    'if/else on a tag',
  ],
  [
    'an if/else if chain on a direct tag, once',
    'export const a = (): number => {\n  if (read._tag === "Ready") {\n    return 1\n  } else if (read._tag === "Failed") {\n    return 2\n  } else {\n    return 3\n  }\n}',
    'if/else on a tag',
  ],
  [
    'an else-if whose later condition is a direct tag',
    'export const a = (n: number): number => {\n  if (n > 0) {\n    return 1\n  } else if (read._tag === "Failed") {\n    return 2\n  } else {\n    return 3\n  }\n}',
    'if/else on a tag',
  ],
  [
    'an else-if chain with a tag in its last condition, once',
    'export const a = (n: number): number => {\n  if (n > 0) return 1\n  else if (n < 0) return 2\n  else if (read._tag === "Failed") return 3\n  else return 4\n}',
    'if/else on a tag',
  ],
  [
    'an if/return pair on a direct tag',
    'export const a = (): number => {\n  if (read._tag === "Ready") return 1\n  return 2\n}',
    'if/return pair on a tag',
  ],
  [
    'an if/return pair whose then-branch is a block',
    'export const a = (): number => {\n  if (read._tag === "Ready") {\n    return 1\n  }\n  return 2\n}',
    'if/return pair on a tag',
  ],
  [
    'an if/return pair on a held tag',
    'const tag = read._tag\nexport const a = (): number => {\n  if (tag === "Ready") return 1\n  return 2\n}',
    'if/return pair on a held tag',
  ],
  [
    'an if/return pair on two tags joined by ||',
    'export const a = (): number => {\n  if (read._tag === "Ready" || read._tag === "Failed") return 1\n  return 2\n}',
    'if/return pair on a tag',
  ],
  [
    'an if/return pair on a negated tag comparison',
    'export const a = (): number => {\n  if (!(read._tag === "Ready")) return 1\n  return 2\n}',
    'if/return pair on a tag',
  ],
  [
    'a negated tag comparison in a ternary',
    'export const a = !(read._tag === "Ready") ? 1 : 2',
    'ternary on a tag',
  ],
  [
    'a loose == on a tag in a ternary',
    'export const a = read._tag == "Ready" ? 1 : 2',
    'ternary on a tag',
  ],
  [
    'a loose != on a tag in an if/else',
    'export const a = (): number => {\n  if (read._tag != "Ready") {\n    return 1\n  } else {\n    return 2\n  }\n}',
    'if/else on a tag',
  ],
  [
    'a tag read as x["_tag"] in a ternary',
    'export const a = read["_tag"] === "Ready" ? 1 : 2',
    'ternary on a tag',
  ],
  [
    'a tag compared with a constant of a literal type',
    'const READY = "Ready" as const\nexport const a = read._tag === READY ? 1 : 2',
    'ternary on a tag',
  ],
  [
    'a ternary inside a filter predicate',
    'declare const rows: ReadonlyArray<Read>\nexport const a = rows.filter(row => (row._tag === "Ready" ? true : false))',
    'ternary on a tag',
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
    'const tag = read._tag\nexport const a = (): number => {\n  if (tag === "Ready") return 1\n  console.log(tag)\n  return 2\n}',
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
  [
    'a lone if on a direct tag, a narrowing guard',
    'export const a = (): number => {\n  if (read._tag === "Ready") return 1\n  console.log(read)\n  return 2\n}',
  ],
  [
    'a guard mixing a tag with another check, then a return',
    'export const a = (n: number): number => {\n  if (read._tag !== "Ready" || n > 0) return 1\n  return 2\n}',
  ],
  [
    'a lone narrowing if with no return after it',
    'export const a = (): void => {\n  if (read._tag === "Ready") console.log(read)\n}',
  ],
  [
    'a tag compared with a constant typed string',
    'declare const READY: string\nexport const a = read._tag === READY ? 1 : 2',
  ],
  [
    'an else-if chain with no tag in it',
    'export const a = (n: number): number => {\n  if (n > 0) return 1\n  else if (n < 0) return 2\n  else return 3\n}',
  ],
  [
    'a direct tag compared as a value in a filter predicate',
    'declare const rows: ReadonlyArray<Read>\nexport const a = rows.filter(row => row._tag === "Ready")',
  ],
  [
    'a direct tag compared as a value in find and some',
    'declare const rows: ReadonlyArray<Read>\nexport const a = [rows.find(row => row._tag !== "Ready"), rows.some(row => row._tag === "Failed")]',
  ],
  [
    'a ternary on a direct tag marked open',
    '// tag-check: open, another application\'s Message\nexport const a = loose._tag === "Ready" ? 1 : 2',
  ],
  [
    'an if/else on a direct tag marked open',
    'export const a = (): number => {\n  // tag-check: open, another application\'s Message\n  if (loose._tag === "Ready") {\n    return 1\n  } else {\n    return 2\n  }\n}',
  ],
  [
    'a ternary comparing two tags, neither a literal',
    'declare const other: Read\nexport const a = read._tag === other._tag ? 1 : 2',
  ],
  [
    'a ternary on something that is not a tag comparison',
    'export const a = read._tag.length === 5 ? 1 : 2',
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

test.each([
  ['a bare mark', '// tag-check: open\n'],
  ['a mark with only a separator', '// tag-check: open —\n'],
  ['the mark inside a string', "const note = 'tag-check: open, because'\n"],
])('%s does not excuse a branch on an open tag', (_name, lead) => {
  expect(findingsOf(`${lead}export const a = loose._tag === "Ready" ? 1 : 2`)).not.toEqual([])
})
