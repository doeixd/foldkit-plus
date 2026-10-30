/**
 * The sort Picker island, broken in turn:
 * `pnpm mutate examples/widgets/test/picker.mutations.ts`.
 */
const tests = ['examples/widgets/test/picker.test.ts']
const file = '../src/picker/app.ts'

export default [
  {
    name: 'any value goes, an order or not',
    edits: [{ file, find: '        isSort,\n', replace: '        () => true,\n' }],
    tests,
  },
  {
    name: 'a choice is dropped',
    edits: [
      {
        file,
        find: 'sort: sort => Option.orElse(chosen, () => sort),',
        replace: 'sort: sort => sort,',
      },
    ],
    tests,
  },
  {
    name: 'a Message that changes nothing makes a new Model',
    edits: [
      {
        file,
        find: 'next.model === model.picker && Option.isNone(chosen)',
        replace: 'false',
      },
    ],
    tests,
  },
]
