/**
 * `EditableEntity`'s rules, each broken in turn: `pnpm mutate
 * packages/sync/test/entity.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/sync/test/entity.test.ts']
const file = '../src/entity.ts'

export default [
  {
    name: 'a table at an edit’s sequence does not hold it',
    edits: [
      {
        file,
        find: 'Option.exists(edit.at, at => at <= revision)',
        replace: 'Option.exists(edit.at, at => at < revision)',
      },
    ],
    tests,
  },
  {
    name: 'a cell is its row alone',
    edits: [
      {
        file,
        find: 'Equal.equals(a.id, b.id) && a.member === b.member',
        replace: 'Equal.equals(a.id, b.id)',
      },
    ],
    tests,
  },
  {
    name: 'a replacement by another tab of the same person is not one',
    edits: [
      {
        file,
        find: 'by.replica !== replica && !Equal.equals(edit.value, prior.value)',
        replace:
          "by.actor !== prior.by.pipe(Option.map(author => author.actor), Option.getOrElse(() => '')) && !Equal.equals(edit.value, prior.value)",
      },
    ],
    tests,
  },
  {
    name: 'changeAt reads one member whichever is asked',
    edits: [{ file, find: 'value: row[member] })', replace: "value: row['price' as M] })" }],
    tests,
  },
  {
    name: 'absorbing nothing makes a new array',
    edits: [{ file, find: '        : edits,\n', replace: '        : [...edits],\n' }],
    tests,
  },
]
