/**
 * The lowering, broken in turn:
 * `pnpm mutate packages/remote-domain/test/lower/lower.mutations.ts`.
 */
const write = '../../src/lower/write.ts'
const check = '../../src/lower/check.ts'
const parity = 'examples/writes-domain/test/lower/parity.test.ts'
const ledger = 'examples/writes-domain/test/lower/ledger.test.ts'
const story = 'examples/writes-domain/test/lower/story.test.ts'
const checks = 'packages/remote-domain/test/lower/check.test.ts'

export default [
  {
    // The rule both interpreters judge by is declared once: changed there, both flip.
    name: 'reservedWithinStock refuses reserving the stock exactly',
    edits: [
      {
        file: '../../../../examples/writes/src/domain.ts',
        find: 'Expr.lte(after.reserved, after.stock)',
        replace: 'Expr.lt(after.reserved, after.stock)',
      },
    ],
    tests: [parity],
  },
  {
    name: 'evolve adds the quantity instead of copying the outcome recorded',
    edits: [
      {
        file: '../../../../examples/writes-domain/src/model.ts',
        find: 'reserved: event.reservedAfter,',
        replace: 'reserved: row.reserved + event.quantity,',
      },
    ],
    tests: [story],
  },
  {
    name: "Lower.check reads a body's fields, not what it reaches",
    edits: [{ file: check, find: 'reaches.length === 0', replace: 'true' }],
    tests: [checks],
  },
  {
    name: 'an operation reused with another request is decided as new',
    edits: [
      {
        file: write,
        find: 'each.operation === operation && each.digest !== digest',
        replace: 'false',
      },
    ],
    tests: [ledger],
  },
  {
    name: 'the aggregate forgets the operations it decided',
    edits: [
      {
        file: write,
        find: '[...operations.filter(each => each.operation !== decided.operation), decided]',
        replace: 'operations',
      },
    ],
    tests: [ledger],
  },
  {
    name: 'a reused operation is Reused to who the guard refuses too',
    edits: [
      {
        file: write,
        find: 'Result.isFailure(judged) && Schema.is(Forbidden)(judged.failure)',
        replace: 'false',
      },
    ],
    tests: [ledger],
  },
  {
    name: 'every refusal is answered as a conflict',
    edits: [{ file: write, find: '                        refusal._tag,', replace: "'Conflict'," }],
    tests: [parity, story],
  },
]
