/**
 * Each place the client judges a row by `Remote.make`'s operator table, its
 * table dropped in turn: `pnpm mutate packages/remote/test/operators.mutations.ts`.
 */
const tests = ['packages/remote/test/operators.test.ts']

export default [
  {
    name: 'a write is judged without the table',
    edits: [
      {
        file: '../src/index.ts',
        find: 'impactOn(held, visible, change, operators)',
        replace: 'impactOn(held, visible, change)',
      },
    ],
    tests,
  },
  {
    name: 'a pending edit is placed without the table',
    edits: [
      {
        file: '../src/index.ts',
        find: 'impactOn({ ...query.value, connection: placed, holds }, store, change, operators)',
        replace: 'impactOn({ ...query.value, connection: placed, holds }, store, change)',
      },
    ],
    tests,
  },
  {
    name: 'a live insert is judged without the table',
    edits: [
      {
        file: '../src/index.ts',
        find: '      entityKey(event.edge.ref.entity, event.edge.ref.id),\n      operators,\n',
        replace: '      entityKey(event.edge.ref.entity, event.edge.ref.id),\n',
      },
    ],
    tests,
  },
  {
    name: 'a changed row is judged without the table',
    edits: [
      {
        file: '../src/impact.ts',
        find: 'belongsEncoded(store, descriptor, connection.encoded, key, operators)',
        replace: 'belongsEncoded(store, descriptor, connection.encoded, key)',
      },
    ],
    tests,
  },
]
