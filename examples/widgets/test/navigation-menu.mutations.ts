/**
 * The navigation-menu example, broken in turn:
 * `pnpm mutate examples/widgets/test/navigation-menu.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['examples/widgets/test/navigation-menu.test.ts']

export default [
  {
    name: 'following leaves the section open',
    edits: [
      {
        file: '../src/navigation-menu/app.ts',
        find: 'openSection: Option.none(),\n          openedByPointer: false,\n          followed:',
        replace:
          'openSection: model.openSection,\n          openedByPointer: false,\n          followed:',
      },
    ],
    tests,
  },
  {
    name: 'leaving keeps the section',
    edits: [
      {
        file: '../src/navigation-menu/app.ts',
        find: "case 'LeftBar':\n      return { model: shut(model) }",
        replace: "case 'LeftBar':\n      return { model }",
      },
    ],
    tests,
  },
  {
    name: 'the popup locks the page',
    edits: [
      {
        file: '../src/navigation-menu/view.ts',
        find: 'policy: Overlay.nonModal,',
        replace: 'policy: Overlay.modal,',
      },
    ],
    tests,
  },
  {
    name: 'a click after a hover shuts the section',
    edits: [
      {
        file: '../src/navigation-menu/app.ts',
        find: 'if (model.openedByPointer && isSection(model.openSection, message.section)) {\n        return { model: { ...model, openedByPointer: false } }\n      }\n',
        replace: '',
      },
    ],
    tests,
  },
]
