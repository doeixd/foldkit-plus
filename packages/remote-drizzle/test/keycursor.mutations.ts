/**
 * Key cursors, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/keycursor.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/keycursor.test.ts']
const cursor = '../src/cursor.ts'
const index = '../src/index.ts'

export default [
  {
    name: 'a page ends on its row’s id, not its keys',
    edits: [
      {
        file: index,
        find: 'Option.getOrElse(keyCursor(orderBy.map(term => row[term.column.name])), () =>',
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
        find: '      return Option.some(BigInt(value.$bigint))\n    }\n  }\n  return Option.none()',
        replace:
          '      return Option.some(BigInt(value.$bigint))\n    }\n  }\n  return Option.some(value)',
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
]
