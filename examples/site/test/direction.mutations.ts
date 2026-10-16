/** The component gallery's reading direction, broken in turn. */
export default [
  {
    name: 'the component page ignores its reading direction',
    edits: [
      {
        file: '../src/main.ts',
        find: '    ChoseDirection: ({ direction }) => withKnobs(model, { ...model.knobs, direction }),',
        replace: '    ChoseDirection: () => ({ model }),',
      },
    ],
    tests: ['examples/site/test/components.test.ts'],
  },
]
