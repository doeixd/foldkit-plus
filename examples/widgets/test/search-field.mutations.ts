/**
 * The search field demo, broken in turn: `pnpm mutate
 * examples/widgets/test/search-field.mutations.ts`.
 */
const child = '../src/search-field/child.ts'
const demo = '../src/search-field/demo.ts'
const view = '../src/search-field/view.ts'
const unit = ['examples/widgets/test/search-field.test.ts']
const browser = ['examples/widgets/test/search-field.browser.test.ts']

export default [
  {
    name: 'typing ignores the supplied text',
    edits: [
      {
        file: child,
        find: 'value === model.value ? { model } : { model: modifyFields(model, { value: () => value }) },',
        replace: '{ model },',
      },
    ],
    tests: unit,
  },
  {
    name: 'clearing leaves the value unchanged',
    edits: [{ file: child, find: "value: () => '',", replace: 'value: () => model.value,' }],
    tests: unit,
  },
  {
    name: 'clearing leaves the results open',
    edits: [
      {
        file: child,
        find: 'resultsOpen: () => false',
        replace: 'resultsOpen: () => model.resultsOpen',
      },
    ],
    tests: unit,
  },
  {
    name: 'clearing does not return focus to the input',
    edits: [
      {
        file: child,
        find: 'commands: [SearchField.Focus({ id: model.id })],',
        replace: '',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the second view routes to the first placement',
    edits: [{ file: demo, find: 'second.view(model, h),', replace: 'first.view(model, h),' }],
    tests: unit,
  },
  {
    name: 'the application route for ArrowDown is dropped',
    edits: [{ file: view, find: 'routes: [openResults],', replace: '' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'the page does not draw the description',
    edits: [
      {
        file: demo,
        find: '[Assembly.textOf(description)]',
        replace: "['Search']",
      },
    ],
    tests: browser,
  },
]
