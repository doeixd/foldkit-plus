/**
 * The primitive examples' own code, broken in turn: `pnpm mutate examples/site/test/primitiveExamples.mutations.ts`.
 * `test/primitiveExamples.browser.test.ts` runs five of them on their own state in a real browser.
 */
const dir = '../src/examples/primitives'
const browser = ['examples/site/test/primitiveExamples.browser.test.ts']

export default [
  {
    name: 'the keyboard example listens before it is asked to',
    edits: [
      {
        file: `${dir}/events/keyboard.ts`,
        find: '            listening\n',
        replace: '            true\n',
      },
    ],
    tests: browser,
  },
  {
    name: 'a finished drag of the Move example no longer settles where it ended',
    edits: [
      {
        file: `${dir}/interaction/move.ts`,
        find: 'completed ? within(',
        replace: 'true ? within(',
      },
    ],
    tests: browser,
  },
  {
    name: 'the Debounce example shows no settled value',
    edits: [
      { file: `${dir}/time/debounce.ts`, find: 'settled: out.value', replace: "settled: ''" },
    ],
    tests: browser,
  },
  {
    name: 'the Press example counts a press twice',
    edits: [
      {
        file: `${dir}/interaction/press.ts`,
        find: 'model.presses + 1',
        replace: 'model.presses + 2',
      },
    ],
    tests: browser,
  },
  {
    name: 'the InputMask example masks with another pattern',
    edits: [
      { file: `${dir}/dom/input-mask.ts`, find: "'(###) ###-####'", replace: "'###-###-####'" },
    ],
    tests: browser,
  },
]
