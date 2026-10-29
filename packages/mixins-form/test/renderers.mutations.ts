/**
 * A renderer is found by a kind the application gave one for, never by a name
 * `Object` has (#307): `pnpm mutate packages/mixins-form/test/renderers.mutations.ts`.
 */
export default [
  {
    name: 'the form’s renderers inherit from Object',
    edits: [{ file: '../src/index.ts', find: '    Object.create(null),\n', replace: '    {},\n' }],
    tests: ['packages/mixins-form/test/view.test.ts'],
  },
  {
    name: 'a list or detail reads an inherited renderer',
    edits: [
      {
        file: '../../mixins-crud/src/index.ts',
        find: 'renderers !== undefined && Object.hasOwn(renderers, kind)',
        replace: 'renderers !== undefined',
      },
    ],
    tests: ['packages/mixins-crud/test/runtime.test.ts'],
  },
]
