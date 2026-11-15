/**
 * The roster Table, broken in turn: `pnpm mutate
 * examples/widgets/test/table.mutations.ts`.
 */
const app = '../src/table/app.ts'
const unit = ['examples/widgets/test/table.test.ts']

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
]
