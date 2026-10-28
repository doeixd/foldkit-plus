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
        find: 'impactOn(held, visible, change, operators, context)',
        replace: 'impactOn(held, visible, change, undefined as never, context)',
      },
    ],
    tests,
  },
  {
    name: 'a pending edit is placed without the table',
    edits: [
      {
        file: '../src/index.ts',
        find: 'impactOn({ ...query.value, connection: placed, holds }, store, change, operators, context)',
        replace:
          'impactOn({ ...query.value, connection: placed, holds }, store, change, undefined as never, context)',
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
        find: 'belongsEncoded(store, descriptor, connection.encoded, key, operators, context)',
        replace: 'belongsEncoded(store, descriptor, connection.encoded, key, undefined, context)',
      },
    ],
    tests,
  },
  {
    name: 'a row is placed by a call without the table',
    edits: [
      {
        file: '../src/placement.ts',
        find: 'compareRows(terms, row.value, values, body.entity.name, { input, operators })',
        replace: 'compareRows(terms, row.value, values, body.entity.name, { input })',
      },
    ],
    tests,
  },
  {
    name: 'a call order is placeable by no table',
    edits: [
      {
        file: '../src/placement.ts',
        find: 'Relational.placement(body, input, { operators })',
        replace: 'Relational.placement(body, input)',
      },
    ],
    tests,
  },
  {
    name: "a row's keys are only the fields an order names",
    edits: [
      {
        file: '../src/placement.ts',
        find: 'dependenciesOf(...terms).fields',
        replace: "terms.flatMap(term => (term.expr._tag === 'Field' ? [term.expr] : []))",
      },
    ],
    tests,
  },
  {
    name: "a write's answer is placed without the table",
    edits: [
      {
        file: '../src/impact.ts',
        find: 'placeIn(store, pages, body, connection.encoded, key, operators)',
        replace: 'placeIn(store, pages, body, connection.encoded, key, undefined!)',
      },
    ],
    tests,
  },
  {
    name: 'a live insert is placed by a call without the table',
    edits: [
      {
        file: '../src/index.ts',
        find: 'placeIn(store, placed, body, query.value.encoded, key, operators)',
        replace: 'placeIn(store, placed, body, query.value.encoded, key, undefined!)',
      },
    ],
    tests,
  },
  {
    name: 'a read asks for its order fields only when placeable by no table',
    edits: [
      {
        file: '../src/index.ts',
        find: 'Relational.placement(body, encoded, { operators })',
        replace: 'Relational.placement(body, encoded)',
      },
    ],
    tests,
  },
]
