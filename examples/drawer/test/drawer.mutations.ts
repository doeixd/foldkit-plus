/**
 * The drawer example, broken in turn:
 * `pnpm mutate examples/drawer/test/drawer.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/drawer/test/drawer.test.ts']

export default [
  {
    name: 'any dismissal closes, even for another layer',
    edits: [
      {
        file: '../src/app.ts',
        find: "model: out.ids.includes('drawer') && model.open ? { ...model, open: false } : model,",
        replace: 'model: model.open ? { ...model, open: false } : model,',
      },
    ],
    tests,
  },
  {
    name: 'the drawer is modeless',
    edits: [
      {
        file: '../src/view.ts',
        find: 'policy: Overlay.modal,',
        replace: 'policy: Overlay.nonModal,',
      },
    ],
    tests,
  },
  {
    name: 'the panel draws while closed',
    edits: [
      {
        file: '../src/view.ts',
        find: '...(model.open',
        replace: '...(!model.open',
      },
    ],
    tests,
  },
]
