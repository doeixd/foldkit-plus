/**
 * The previews with state, broken in turn: `pnpm mutate
 * examples/site/test/widgets.mutations.ts`.
 */
const tests = ['examples/site/test/widgets.test.ts']
const widgets = '../src/gallery/widgetsUpdate.ts'

export default [
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
  ...['frequency'].map(field => ({
    name: `the chosen ${field} is not kept`,
    edits: [
      {
        file: widgets,
        find: `model => ({ model: modifyFields(model, { ${field}: () => Option.some(value) }) }),`,
        replace: 'model => ({ model }),',
      },
    ],
    tests,
  })),
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
  ...[
    [
      'the terms box toggles the card too',
      '{ terms: () => checked }',
      '{ terms: () => checked, teamPlan: () => checked }',
    ],
    [
      'the toppings dash comes back when unchecked',
      "const toppings = checked ? 'all' : 'none'",
      "const toppings = checked ? 'all' : 'some'",
    ],
    [
      'a checkbox group example toggles another',
      '[example]: CheckboxGroup.toggled(alerts[example], value),',
      'invalid: CheckboxGroup.toggled(alerts[example], value),',
    ],
    [
      'a drop replaces the files already taken',
      'attachments: current => [\n            ...current,',
      'attachments: current => [\n            ...[],',
    ],
    [
      'a drop keeps no size',
      'files.map(({ name, size }): Attachment => ({ name, size }))',
      'files.map(({ name }): Attachment => ({ name, size: 0 }))',
    ],
  ].map(([name, find, replace]) => ({
    name: name!,
    edits: [{ file: widgets, find: find!, replace: replace! }],
    tests,
  })),
  {
    name: 'a refused code is typed into the filling field',
    edits: [
      {
        file: widgets,
        find: 'otpStates: states => ({ ...states, [field]: code }) }',
        replace: 'otpStates: states => ({ ...states, filling: code }) }',
      },
    ],
    tests,
  },
  {
    name: 'the same state code is written again',
    edits: [
      {
        file: widgets,
        find: 'code === model.otpStates[field]',
        replace: 'false',
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
