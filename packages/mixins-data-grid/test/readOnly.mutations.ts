/**
 * The read-only word of a column's header: `pnpm mutate
 * packages/mixins-data-grid/test/readOnly.mutations.ts` checks that a test
 * fails when the title ignores `words.readOnly` or is drawn on every header.
 */
const view = '../src/view.ts'
const tests = ['packages/mixins-data-grid/test/view.test.ts']

export default [
  {
    name: 'the title ignores the application’s word',
    edits: [{ file: view, find: 'h.Title(readOnlyWord)', replace: "h.Title('Read-only')" }],
    tests,
  },
  {
    name: 'every header carries the title',
    edits: [
      {
        file: view,
        find: '...(readOnly(id) ? [h.AriaReadonly(true), h.Title(readOnlyWord)] : []),',
        replace: '...(readOnly(id) ? [h.AriaReadonly(true)] : []), h.Title(readOnlyWord),',
      },
    ],
    tests,
  },
]
