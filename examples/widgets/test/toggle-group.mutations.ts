/**
 * The toggle-group example, broken in turn:
 * `pnpm mutate examples/widgets/test/toggle-group.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/toggle-group.test.ts']

export default [
  {
    name: 'the choice never empties',
    edits: [
      {
        file: '../src/toggle-group/app.ts',
        find: "export const selArgs = { mode: 'single', allowEmpty: true } as const",
        replace: "export const selArgs = { mode: 'single', allowEmpty: false } as const",
      },
    ],
    tests,
  },
  {
    name: 'pressed follows nothing',
    edits: [
      {
        file: '../src/toggle-group/view.ts',
        find: `h.AriaPressed(
                Option.isSome(selected) && selected.value === option ? 'true' : 'false',
              ),`,
        replace: "h.AriaPressed('false'),",
      },
    ],
    tests,
  },
]
