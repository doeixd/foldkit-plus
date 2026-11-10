/**
 * A layers row and its expander send the Builder's own Messages (#495):
 * `pnpm mutate packages/mixins-builder/test/rows.mutations.ts`.
 */
const view = '../src/index.ts'
const tests = ['packages/mixins-builder/test/runtime.test.ts']

export default [
  {
    name: 'a pressed row asks for nothing',
    edits: [
      {
        file: view,
        find: 'h.OnClick(Message.RowPressed({ id: NodeId.make(id) })),',
        replace: 'h.OnClick(Message.Unhovered()),',
      },
    ],
    tests,
  },
  {
    name: 'an expander presses its row instead',
    edits: [
      {
        file: view,
        find: 'h.OnClick(Message.RowToggled({ id: NodeId.make(id) })),',
        replace: 'h.OnClick(Message.RowPressed({ id: NodeId.make(id) })),',
      },
    ],
    tests,
  },
]
