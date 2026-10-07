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
        find: 'return { model: { ...model, active: message.id } }',
        replace: 'return { model: { ...model, active: null } }',
      },
    ],
    tests,
  },
  {
    name: 'the disabled tool is clickable',
    edits: [
      {
        file: '../src/toolbar/view.ts',
        find: '...(tool.disabled ? [] : [h.OnClick(Message.PressedTool({ id: tool.id }))]),',
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
        find: "h.AriaPressed(model.active === tool.id ? 'true' : 'false'),",
        replace: "h.AriaPressed(model.active === tool.id ? 'false' : 'true'),",
      },
    ],
    tests,
  },
]
