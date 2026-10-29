/**
 * A window judging a delete by the rows it would show, broken in turn:
 * `pnpm mutate packages/remote/test/windowGone.mutations.ts`.
 */
const tests = ['packages/remote/test/windowGone.test.ts']
const file = '../src/index.ts'

export default [
  {
    name: 'a delete past the window is its own',
    edits: [
      { file, find: '    if (size !== undefined && filled >= size) return false\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'a window from the end is read from the start',
    edits: [
      {
        file,
        find: 'const ordered = window.first === undefined ? [...edges].reverse() : edges',
        replace: 'const ordered = edges',
      },
    ],
    tests,
  },
  {
    name: 'a hidden row counts toward the window',
    edits: [{ file, find: '    if (shown.has(edge.key)) filled++\n', replace: '    filled++\n' }],
    tests,
  },
  {
    name: 'no delete counts for the window',
    edits: [
      {
        file,
        find: '    if (gone(entityKey(edge.ref.entity, edge.ref.id))) return true\n',
        replace: '',
      },
    ],
    tests,
  },
]
