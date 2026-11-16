/**
 * An order over text with no declared collation is refused where the answer
 * depends on the order, and not where only membership is judged (#569):
 * `pnpm mutate packages/entity/test/uncollatedOrder.mutations.ts`.
 */
const tests = ['packages/entity/test/uncollatedOrder.test.ts']
const evaluate = '../src/evaluate.ts'
const uncollated = '../src/uncollated.ts'

export default [
  {
    name: 'evaluate sorts text with no collation',
    edits: [
      {
        file: evaluate,
        find: 'if (terms.length === 0) return [...rows]\n  checkCollated(terms, query)',
        replace: 'if (terms.length === 0) return [...rows]',
      },
    ],
    tests,
  },
  {
    name: 'compareRows compares text with no collation',
    edits: [
      {
        file: evaluate,
        find: '  checkCollated(terms, query)\n  checkOrder(keys, terms, query)',
        replace: '  checkOrder(keys, terms, query)',
      },
    ],
    tests,
  },
  {
    // The remote tests judge a pending row's membership under a body ordered by such text.
    name: 'evaluateEach refuses an order that no membership depends on',
    edits: [
      {
        file: evaluate,
        find: '  const terms = Query.orderFor(body, input)\n  const read =',
        replace:
          '  const terms = Query.orderFor(body, input)\n  checkCollated(terms, body.entity.name)\n  const read =',
      },
    ],
    tests: [
      ...tests,
      'packages/remote/test/pendingPlacement.test.ts',
      'packages/remote/test/reachImpact.test.ts',
    ],
  },
  {
    name: 'a declared collation does not answer for the term',
    edits: [
      {
        file: uncollated,
        find: 'Option.isNone(orderTerm.collation) &&',
        replace: 'true &&',
      },
    ],
    tests,
  },
  {
    name: 'a number needs a collation',
    edits: [
      {
        file: uncollated,
        find: '!ordersIntrinsically(Schema.toEncoded(field.schema).ast)',
        replace: 'true',
      },
    ],
    tests,
  },
]
