/**
 * The hover-card example, broken in turn:
 * `pnpm mutate examples/widgets/test/hover-card.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/hover-card.test.ts']

export default [
  {
    name: 'leaving keeps the card',
    edits: [
      {
        file: '../src/hover-card/app.ts',
        find: 'Left: () =>\n      model.open\n        ? { model: modifyFields(model, { open: () => false, openedByPointer: () => false }) }\n        : { model },',
        replace: 'Left: () => ({ model }),',
      },
    ],
    tests,
  },
  {
    name: 'the card locks the page',
    edits: [
      {
        file: '../src/hover-card/view.ts',
        find: 'policy: Overlay.nonModal,',
        replace: 'policy: Overlay.modal,',
      },
    ],
    tests,
  },
  {
    name: 'a click after a hover shuts the card',
    edits: [
      {
        file: '../src/hover-card/app.ts',
        find: 'if (model.openedByPointer && model.open)\n        return { model: modifyFields(model, { openedByPointer: () => false }) }\n',
        replace: '',
      },
    ],
    tests,
  },
]
