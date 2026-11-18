/**
 * The sheet section, broken in turn: `pnpm mutate
 * examples/widgets/test/sheet.mutations.ts`.
 */
const app = '../src/sheet/app.ts'
const view = '../src/sheet/view.ts'
const unit = ['examples/widgets/test/sheet.test.ts']
const browser = ['examples/widgets/test/sheet.browser.test.ts']

export default [
  {
    name: 'the opener opens nothing',
    edits: [
      {
        file: app,
        find: 'App.placements.update(model => App.children.sheet.helpers.open()(model))',
        replace: 'App.placements.update(model => ({ model }))',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the percent reads the lowest point whatever the sheet rests at',
    edits: [
      {
        file: app,
        find: 'model.sheet.points[model.sheet.at] ?? 1',
        replace: 'model.sheet.points[0] ?? 1',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a closed sheet is said to be open',
    edits: [
      {
        file: app,
        find: 'Sheet.isOpen(model.sheet) ? Option.some(restingPercent(model)) : Option.none()',
        replace: 'Option.some(restingPercent(model))',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the sheet has two points',
    edits: [{ file: app, find: 'POINTS = [0.3, 0.6, 1]', replace: 'POINTS = [0.3, 1]' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'the sheet is drawn without its recipe',
    edits: [{ file: view, find: '        style: sheetStyle,\n', replace: '' }],
    tests: browser,
  },
]
