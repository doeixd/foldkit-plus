/**
 * The sort Picker island, broken in turn:
 * `pnpm mutate examples/widgets/test/picker.mutations.ts`.
 */
const tests = ['examples/widgets/test/picker.test.ts']
const file = '../src/picker/app.ts'

export default [
  {
    name: 'any value goes, an order or not',
    edits: [{ file, find: 'Picker.one(SORTS)', replace: "Picker.one([...SORTS, 'rating'])" }],
    tests,
  },
  {
    name: 'a choice is dropped',
    edits: [
      {
        file,
        find: 'sort: sort => Sorts.picked(sort, out)',
        replace: 'sort: sort => sort',
      },
    ],
    tests,
  },
]
