/**
 * The context-menu example, broken in turn:
 * `pnpm mutate examples/widgets/test/context-menu.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/context-menu.test.ts']

export default [
  {
    name: 'choosing forgets the row',
    edits: [
      {
        file: '../src/context-menu/app.ts',
        find: 'action: Option.some(`${message.action} ${open.value}`),',
        replace: 'action: Option.some(message.action),',
      },
    ],
    tests,
  },
  {
    name: 'right-click opens nothing',
    edits: [
      {
        file: '../src/context-menu/view.ts',
        find: 'h.OnContextMenu(Message.OpenedFor({ id: file })),',
        replace: 'h.OnClick(Message.OpenedFor({ id: file })),',
      },
    ],
    tests,
  },
  {
    name: 'the menu locks the page',
    edits: [
      {
        file: '../src/context-menu/view.ts',
        find: 'policy: Overlay.nonModal,',
        replace: 'policy: Overlay.modal,',
      },
    ],
    tests,
  },
]
