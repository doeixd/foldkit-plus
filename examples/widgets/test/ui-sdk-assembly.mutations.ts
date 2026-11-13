/**
 * The search field's inspection, broken in turn: `pnpm mutate
 * examples/widgets/test/ui-sdk-assembly.mutations.ts`.
 */
const file = '../src/ui-sdk-search-field.ts'
const tests = ['examples/widgets/test/ui-sdk-assembly.test.ts']

export default [
  {
    name: 'the clear behavior is named something else',
    edits: [{ file, find: "{ name: 'ClearLabel' }", replace: "{ name: 'Label' }" }],
    tests,
  },
  {
    name: 'the input part is named something else',
    edits: [{ file, find: "name: 'Input',", replace: "name: 'Field'," }],
    tests,
  },
  {
    name: 'the inspection view does not draw the description',
    edits: [{ file, find: 'Assembly.textOf(description)', replace: "'Search'" }],
    tests,
  },
]
