/**
 * The menu-rows section, broken in turn: `pnpm mutate
 * examples/widgets/test/menu-rows.mutations.ts`.
 */
const app = '../src/menu-rows/app.ts'
const view = '../src/menu-rows/view.ts'
const unit = ['examples/widgets/test/menu-rows.test.ts']
const browser = ['examples/widgets/test/menu-rows.browser.test.ts']

export default [
  {
    name: 'the second Copy carries the first one’s value',
    edits: [{ file: app, find: "value: 'copy-link'", replace: "value: 'copy-text'" }],
    tests: unit,
  },
  {
    name: 'a pick reports the first row’s value, not the chosen one’s',
    edits: [
      {
        file: app,
        find: 'picked: () => Option.some(value) }',
        replace: "picked: () => Option.some('rename') }",
      },
    ],
    tests: unit,
  },
  {
    name: 'the picked row is found by label, so a shared label finds the first',
    edits: [
      {
        file: app,
        find: 'ROWS.find(row => row.value === value)',
        replace: 'ROWS.find(row => row.label === ROWS.find(each => each.value === value)?.label)',
      },
    ],
    tests: unit,
  },
  {
    name: 'every Message of the Menu forgets the pick',
    edits: [
      {
        file: app,
        find: 'export const update = App.placements.update()',
        replace:
          'export const update = (model: Model, message: Message) => {\n  const next = App.placements.update()(model, message)\n  return { ...next, model: { ...next.model, picked: Option.none() } }\n}',
      },
    ],
    tests: unit,
  },
  {
    name: 'rows are drawn with no icon',
    edits: [{ file: view, find: '    icon: Icon.view(', replace: '    iconless: Icon.view(' }],
    tests: browser,
  },
  {
    name: 'the rows are drawn without their hints',
    edits: [
      {
        file: view,
        find: '    ...row,\n',
        replace: '    value: row.value,\n    label: row.label,\n',
      },
    ],
    tests: browser,
  },
]
