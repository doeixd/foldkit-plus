/**
 * The command example, broken in turn:
 * `pnpm mutate examples/widgets/test/command.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/widgets/test/command.test.ts']

export default [
  {
    name: 'the filter matches everything',
    edits: [
      {
        file: '../src/command/app.ts',
        find: "return needle === '' ? COMMANDS : COMMANDS.filter(command => command.label.toLocaleLowerCase().includes(needle))",
        replace: 'return COMMANDS',
      },
    ],
    tests,
  },
  {
    name: 'typing rewrites nothing',
    edits: [
      {
        file: '../src/command/app.ts',
        find: 'return { model: { ...model, query: message.text } }',
        replace: 'return { model }',
      },
    ],
    tests,
  },
]
