/**
 * The roster Table, broken in turn: `pnpm mutate
 * examples/widgets/test/table.mutations.ts`.
 */
const app = '../src/table/app.ts'
const view = '../src/table/view.ts'
const unit = ['examples/widgets/test/table.test.ts']
const browser = ['examples/widgets/test/table.browser.test.ts']

export default [
  {
    name: 'a second press on a heading sorts ascending again',
    edits: [
      {
        file: app,
        find: 'sort => Table.nextSort(sort, column)',
        replace: "() => Option.some({ column, direction: 'ascending' as const })",
      },
    ],
    tests: unit,
  },
  {
    name: 'descending keeps the ascending order',
    edits: [
      {
        file: app,
        find: "return direction === 'ascending' ? order : order.reverse()",
        replace: 'return order',
      },
    ],
    tests: unit,
  },
  {
    name: 'a name that is no column sorts',
    edits: [{ file: app, find: 'isSortColumn(column)\n        ?', replace: 'true\n        ?' }],
    tests: unit,
  },
  {
    name: 'a toggle changes every member',
    edits: [
      {
        file: app,
        find: 'member.id === id ? { ...member, active: !member.active } : member',
        replace: '({ ...member, active: !member.active })',
      },
    ],
    tests: unit,
  },
  {
    name: 'a toggle of an unknown id makes a new Model',
    edits: [{ file: app, find: 'model.members.some(member => member.id === id)', replace: 'true' }],
    tests: unit,
  },
  {
    name: 'the name is a plain cell, not the row heading',
    edits: [{ file: view, find: 'rowHeader: true, ', replace: '' }],
    tests: browser,
  },
  {
    name: 'the row button sends nothing',
    edits: [{ file: view, find: 'onClick: Message.Toggled({ id: member.id }),', replace: '' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'the heading does not report the sort',
    edits: [{ file: view, find: 'sort: { by: model.sort,', replace: 'sort: { by: initial.sort,' }],
    tests: unit,
  },
]
