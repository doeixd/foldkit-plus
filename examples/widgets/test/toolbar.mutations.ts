/**
 * The toolbar example, broken in turn:
 * `pnpm mutate examples/widgets/test/toolbar.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/widgets/test/toolbar.test.ts']

export default [
  {
    name: 'pressing reports the wrong tool',
    edits: [
      {
        file: '../src/toolbar/app.ts',
        find: 'return { model: { ...model, active: Option.some(message.id) } }',
        replace: 'return { model: { ...model, active: Option.none() } }',
      },
    ],
    tests,
  },
  {
    name: 'the disabled tool is clickable',
    edits: [
      {
        file: '../src/toolbar/view.ts',
        find: `...(tool.disabled
                ? [h.Title('Unavailable with plain text selected')]
                : [h.OnClick(Message.PressedTool({ id: tool.id }))]),`,
        replace: '...[h.OnClick(Message.PressedTool({ id: tool.id }))],',
      },
    ],
    tests,
  },
  {
    name: 'pressed state reads backwards',
    edits: [
      {
        file: '../src/toolbar/view.ts',
        find: "Option.isSome(model.active) && model.active.value === tool.id ? 'true' : 'false',",
        replace:
          "Option.isSome(model.active) && model.active.value === tool.id ? 'false' : 'true',",
      },
    ],
    tests,
  },
]
