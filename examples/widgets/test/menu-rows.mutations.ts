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
        find: 'Option.map(Option.fromNullishOr(next.outMessage), ({ value }) => value)',
        replace: "Option.map(Option.fromNullishOr(next.outMessage), () => 'rename')",
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
    name: 'a Menu step that changes nothing makes a new Model',
    edits: [
      {
        file: app,
        find: 'next.model === model.menu && Option.isNone(picked) && commands.length === 0',
        replace: 'false',
      },
    ],
    tests: unit,
  },
  {
    name: 'a later Menu step forgets the pick',
    edits: [
      {
        file: app,
        find: 'picked: current => (Option.isSome(picked) ? picked : current),',
        replace: 'picked: () => picked,',
      },
    ],
    tests: unit,
  },
  {
    name: 'the Menu’s Commands are dropped, so focus is not returned',
    edits: [
      { file: app, find: '        commands,\n      }', replace: '        commands: [],\n      }' },
    ],
    tests: browser,
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
