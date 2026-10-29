/**
 * What a relation picker offers and requires (#308, #309, #310), broken in
 * turn: `pnpm mutate packages/crud/test/pickers.mutations.ts`.
 */
const crud = '../src/index.ts'
const tests = ['packages/crud/test/list.test.ts']

export default [
  {
    name: 'each chosen id scans the listed choices',
    edits: [
      {
        file: crud,
        find: '(shown.has(id) ? [] :',
        replace: '(listed.some(item => item.value === id) ? [] :',
      },
    ],
    tests,
  },
  {
    name: 'a chosen row is required under key:id',
    edits: [{ file: crud, find: 'JSON.stringify([key, id])', replace: '`${key}:${id}`' }],
    tests,
  },
  {
    name: 'a failed read holds nothing',
    edits: [
      {
        file: crud,
        find: '    Failed: (_, previous) => previous,',
        replace: '    Failed: () => Option.none(),',
      },
    ],
    tests,
  },
]
