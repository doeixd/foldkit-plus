/**
 * The resizable split's layout, broken in turn: `pnpm mutate examples/widgets/test/resizable.mutations.ts`.
 */
const file = '../src/style.ts'
const tests = ['examples/widgets/test/resizable.browser.test.ts']

export default [
  {
    name: 'the status is a third column beside the panels',
    edits: [
      {
        file,
        find: "status: Style.self({ flexBasis: '100%', margin: '0' }),",
        replace: "status: Style.self({ margin: '0' }),",
      },
    ],
    tests,
  },
  {
    name: 'the handle can be pressed only where it is drawn',
    edits: [
      {
        file,
        find: "Style.nest('&::before', { content: '\"\"', position: 'absolute', inset: '0 -0.5rem' }),",
        replace: '',
      },
    ],
    tests,
  },
]
