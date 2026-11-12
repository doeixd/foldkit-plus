/**
 * The quick add's submit gate, broken:
 * `pnpm mutate examples/cloudflare/test/quickAdd.mutations.ts`
 */
const tests = ['examples/cloudflare/test/addForm.browser.test.ts']

export default [
  {
    name: 'the quick add disables its button by the default gate',
    edits: [
      {
        file: '../src/app.ts',
        find: 'FormView.submodel(AddTodoForm, AddView, { canSubmit: () => true })',
        replace: 'FormView.submodel(AddTodoForm, AddView)',
      },
    ],
    tests,
  },
]
