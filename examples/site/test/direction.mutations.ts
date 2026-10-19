/** The component gallery's reading direction, broken in turn. */
export default [
  {
    name: 'the component page ignores its reading direction',
    edits: [
      {
        file: '../src/main.ts',
        find: 'modifyFields(model, { direction: () => direction })',
        replace: 'model',
      },
    ],
    tests: ['examples/site/test/components.test.ts'],
  },
]
