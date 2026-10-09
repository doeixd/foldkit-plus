/**
 * The menubar example, broken in turn:
 * `pnpm mutate examples/widgets/test/menubar.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/widgets/test/menubar.test.ts']

export default [
  {
    name: 'choosing leaves the menu open',
    edits: [
      {
        file: '../src/menubar/app.ts',
        find: 'openMenu: Option.none(),\n          choice:',
        replace: 'openMenu: model.openMenu,\n          choice:',
      },
    ],
    tests,
  },
  {
    name: 'choosing forgets the menu',
    edits: [
      {
        file: '../src/menubar/app.ts',
        find: 'choice: Option.some(choiceOf(open.value, message.item)),',
        replace: 'choice: Option.some(message.item),',
      },
    ],
    tests,
  },
  {
    name: 'the popup locks the page',
    edits: [
      {
        file: '../src/menubar/view.ts',
        find: 'policy: Overlay.nonModal,',
        replace: 'policy: Overlay.modal,',
      },
    ],
    tests,
  },
]
