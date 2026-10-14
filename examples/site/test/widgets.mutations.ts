/**
 * The previews with state, broken in turn: `pnpm mutate
 * examples/site/test/widgets.mutations.ts`.
 */
const tests = ['examples/site/test/widgets.test.ts']
const widgets = '../src/gallery/widgets.ts'

export default [
  {
    name: 'a chosen tab is not shown',
    edits: [
      {
        file: widgets,
        find: ': { model: modifyFields(model, { section: () => value }) },',
        replace: ': { model },',
      },
    ],
    tests,
  },
  {
    name: 'a chosen billing is not kept',
    edits: [
      {
        file: widgets,
        find: ': { model: modifyFields(model, { billing: () => value }) },',
        replace: ': { model },',
      },
    ],
    tests,
  },
  {
    name: 'the slider moves without the volume',
    edits: [
      {
        file: widgets,
        find: '{ model: modifyFields(model, { volume: () => value }) },',
        replace: '{ model },',
      },
    ],
    tests,
  },
  {
    name: 'the dialog does not close',
    edits: [
      { file: widgets, find: '  update: UiDialog.close,', replace: '  update: UiDialog.open,' },
    ],
    tests,
  },
]
