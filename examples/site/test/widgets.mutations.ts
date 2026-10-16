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
  ...['frequency', 'city', 'due'].map(field => ({
    name: `the chosen ${field} is not kept`,
    edits: [
      {
        file: widgets,
        find: `model => ({ model: modifyFields(model, { ${field}: () => Option.some(${field === 'due' ? 'date' : 'value'}) }) }),`,
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
    name: 'a picked day never joins the calendar selection',
    edits: [
      {
        file: widgets,
        find: 'selection: () => DateSelection.picked(model.selection, date),',
        replace: 'selection: () => model.selection,',
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
    ['the trail never unfolds', '{ trailExpanded: () => true }', '{ trailExpanded: () => false }'],
    [
      'a pressed format cannot be released',
      'formats.includes(format) ? formats.filter(on => on !== format) : [...formats, format]',
      '[...formats, format]',
    ],
    [
      'every pagination example moves together',
      '[example]: page }',
      'numbered: page, simple: page, ends: page, range: page, siblings: page, compact: page }',
    ],
    [
      'a new page size keeps the old page',
      'range: Math.floor(((pages.range - 1) * model.perPage) / perPage) + 1,',
      'range: pages.range,',
    ],
    [
      'a checkbox group example toggles another',
      '[example]: CheckboxGroup.toggled(alerts[example], value),',
      'invalid: CheckboxGroup.toggled(alerts[example], value),',
    ],
    [
      'the range picker forgets its start',
      'stayDates: () => DateSelection.picked(model.stayDates, date),',
      "stayDates: () => DateSelection.picked(DateSelection.empty('Range'), date),",
    ],
  ].map(([name, find, replace]) => ({
    name: name!,
    edits: [{ file: widgets, find: find!, replace: replace! }],
    tests,
  })),
]
