/**
 * The search field's inspection, broken in turn: `pnpm mutate
 * examples/widgets/test/search-field-assembly.mutations.ts`.
 */
const file = '../src/search-field/demo.ts'
const tests = ['examples/widgets/test/search-field-assembly.test.ts']

export default [
  {
    name: 'the field part is named something else',
    edits: [{ file, find: "name: 'SearchField',", replace: "name: 'Field'," }],
    tests,
  },
  {
    name: 'the description drops the pattern',
    edits: [
      {
        file,
        find: "        pattern: { name: 'searchField', pattern: SearchField.SearchFieldPattern },\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the description drops the bundle link',
    edits: [{ file, find: "links: [{ kind: 'bundle', name: 'Search' }],", replace: '' }],
    tests,
  },
]
