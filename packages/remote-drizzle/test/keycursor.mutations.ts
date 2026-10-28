/**
 * Key cursors, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/keycursor.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/keycursor.test.ts']
const nonFiniteTests = [...tests, 'packages/remote-drizzle/test/nonFiniteKey.test.ts']
const cursor = '../src/cursor.ts'
const index = '../src/index.ts'

export default [
  {
    name: 'a number JSON cannot write is kept as null',
    edits: [
      {
        file: cursor,
        find: "if (typeof value === 'number' && !Number.isFinite(value)) {",
        replace: 'if (false) {',
      },
    ],
    tests: nonFiniteTests,
  },
  {
    name: 'any tagged number is read back',
    edits: [{ file: cursor, find: ' && nonFinite.has(value.$number)', replace: '' }],
    tests,
  },
  {
    name: 'a page ends on its row’s id, not its keys',
    edits: [
      {
        file: index,
        find: 'Option.getOrElse(keyCursor(keysOf(orderBy, row)), () =>',
        replace: 'Option.getOrElse(Option.none<string>(), () =>',
      },
    ],
    tests,
  },
  {
    name: 'a cursor of another order’s length is read',
    edits: [
      {
        file: cursor,
        find: 'if (!Array.isArray(parsed) || parsed.length !== terms) return CursorRead.Invalid()',
        replace: 'if (!Array.isArray(parsed)) return CursorRead.Invalid()',
      },
    ],
    tests,
  },
  {
    name: 'any object passes for a key value',
    edits: [
      {
        file: cursor,
        find: '      return Option.some(Number(value.$number))\n    }\n  }\n  return Option.none()',
        replace:
          '      return Option.some(Number(value.$number))\n    }\n  }\n  return Option.some(value)',
      },
    ],
    tests,
  },
  {
    name: 'a date that is not one passes',
    edits: [
      {
        file: cursor,
        find: 'return Number.isNaN(date.getTime()) ? Option.none() : Option.some(date)',
        replace: 'return Option.some(date)',
      },
    ],
    tests,
  },
  {
    name: 'a bigint that is not one passes',
    edits: [
      {
        file: cursor,
        find: '.test(value.$bigint)) {',
        replace: '.test(value.$bigint) || true) {',
      },
    ],
    tests,
  },
  {
    name: 'a cursor from before keys is refused',
    edits: [
      {
        file: cursor,
        find: 'if (!cursor.startsWith(KEYED)) return CursorRead.Id({ id: cursor })',
        replace: 'if (!cursor.startsWith(KEYED)) return CursorRead.Invalid()',
      },
    ],
    tests,
  },
  {
    name: 'a key is read back by its column name',
    edits: [
      {
        file: '../src/cursor.ts',
        find: 'terms.map((_, index) => row[`key${index}`])',
        replace: 'terms.map(term => row[(term.key as { readonly name: string }).name])',
      },
    ],
    tests,
  },
]
