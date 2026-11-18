/**
 * The previews with state, broken in turn: `pnpm mutate
 * examples/site/test/widgets.mutations.ts`.
 */
const tests = ['examples/site/test/widgets.test.ts']
const widgets = '../src/gallery/widgetsUpdate.ts'

export default [
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
    name: 'the same volume makes a new Model',
    edits: [
      {
        file: widgets,
        find: 'value === model.volume ? { model }',
        replace: 'value === model.volume ? { model: { ...model } }',
      },
    ],
    tests,
  },
  {
    name: 'the range slider moves without the price range',
    edits: [
      {
        file: widgets,
        find: ': { model: modifyFields(model, { priceRange: () => value }) },',
        replace: ': { model },',
      },
    ],
    tests,
  },
  {
    name: 'the dialog does not close',
    edits: [
      {
        file: widgets,
        find: '  ...dialogField,\n  update: UiDialog.close,',
        replace: '  ...dialogField,\n  update: UiDialog.open,',
      },
    ],
    tests,
  },
  {
    name: 'a chosen page action is not kept',
    edits: [
      {
        file: widgets,
        find: 'modifyFields(model, { pageChoice: () => chosenOf(chosen) })',
        replace: 'modifyFields(model, { pageChoice: () => Option.none() })',
      },
    ],
    tests,
  },
  {
    name: 'saving the draft says something else',
    edits: [{ file: widgets, find: "title: 'Draft saved'", replace: "title: 'Saved'" }],
    tests,
  },
  {
    name: 'a chosen range is not pressed',
    edits: [
      {
        file: widgets,
        find: '{ model: modifyFields(model, { range: () => range }) }',
        replace: '{ model }',
      },
    ],
    tests,
  },
  {
    name: 'a checkbox group example toggles another',
    edits: [
      {
        file: widgets,
        find: '[example]: CheckboxGroup.toggled(alerts[example], value),',
        replace: 'invalid: CheckboxGroup.toggled(alerts[example], value),',
      },
    ],
    tests,
  },
  {
    name: 'a drawer press is not kept',
    edits: [
      {
        file: widgets,
        find: ': { model: modifyFields(model, { drawer: () => drawer }) }',
        replace: ': { model }',
      },
    ],
    tests,
  },
]
