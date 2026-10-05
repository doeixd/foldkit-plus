/**
 * `EditableEntity`'s rules, each broken in turn: `pnpm mutate
 * packages/sync/test/entity.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/sync/test/entity.test.ts']
const file = '../src/entity.ts'

export default [
  {
    name: 'a row at an edit’s sequence does not hold it',
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
    name: 'an edit is held whatever its row’s revision',
    edits: [
      {
        file,
        find: 'Option.exists(revisionOf(edit.id), revision => !reached(edit, revision)),',
        replace: 'Option.isSome(revisionOf(edit.id)),',
      },
    ],
    tests,
  },
  {
    name: 'a settled edit is replaced whoever wrote it',
    edits: [
      {
        file,
        find: 'if (mine(edit, replica) && !Equal.equals(row[edit.member], edit.value)) {',
        replace: 'if (!Equal.equals(row[edit.member], edit.value)) {',
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
    name: 'absorbing nothing makes a new array',
    edits: [{ file, find: '        : edits,\n', replace: '        : [...edits],\n' }],
    tests,
  },
]
