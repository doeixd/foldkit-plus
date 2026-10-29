/**
 * Cursors from before keys whose ids begin `k:` (#322), broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/keycursorLegacy.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/keycursorLegacy.test.ts']

export default [
  {
    name: 'a cursor read as keyed is never asked for as an id',
    edits: [
      {
        file: '../src/index.ts',
        find: "CursorRead.$is('Id')(read) ? Option.none() : yield* keysAt(cursor)",
        replace: 'Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'an id cursor is not read as the id it names',
    edits: [
      {
        file: '../src/cursor.ts',
        find: 'return CursorRead.Id({ id: parsed.id })',
        replace: 'return CursorRead.Invalid()',
      },
    ],
    tests,
  },
  {
    name: 'a page whose keys JSON cannot carry ends on a bare id',
    edits: [
      {
        file: '../src/index.ts',
        find: '() => idCursor(String(row.id))',
        replace: '() => String(row.id)',
      },
    ],
    tests,
    survives:
      'only an order key of a kind JSON cannot carry (a blob) reaches the fallback, and no fixture orders by one; a bare id is still read by its row, as one from before keys is',
  },
]
