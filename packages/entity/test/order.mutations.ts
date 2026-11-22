/**
 * A chosen order, broken in turn:
 * `pnpm mutate packages/entity/test/order.mutations.ts`.
 */
const tests = [
  'packages/entity/test/expr.test.ts',
  'packages/remote/test/impact.test.ts',
  'packages/remote/test/matching.test.ts',
  'packages/remote-drizzle/test/compile.test.ts',
]
const expr = '../src/expr/query.ts'
const dependencies = '../src/expr/dependencies.ts'
const evaluate = '../src/evaluate.ts'
const impact = '../../remote/src/impact.ts'
const drizzle = '../../remote-drizzle/src/index.ts'
const compile = '../../remote-drizzle/src/compile.ts'

export default [
  {
    name: 'a null sort is refused',
    edits: [
      { file: expr, find: 'if (sort === null || sort === undefined) return []', replace: '' },
    ],
    tests,
  },
  {
    name: 'a name the order does not offer is taken',
    edits: [{ file: expr, find: '!Object.hasOwn(chosen.choices, picked) ||', replace: '' }],
    tests,
  },
  {
    name: 'any direction is taken',
    edits: [
      { file: expr, find: "(direction !== 'asc' && direction !== 'desc')", replace: 'false' },
    ],
    tests,
  },
  {
    name: 'the choices are not read as dependencies',
    edits: [
      {
        file: dependencies,
        find: '          ...Object.values(choices).map(choice => choice.node),\n',
        replace: '',
      },
    ],
    tests,
  },
  // 'a choice of another Entity is accepted' is gone as its own mutation: dependencies and
  // ownership now read a chosen order's choices through the one `nodesOf`, so it is the one above.
  {
    name: 'the evaluator ignores the order',
    edits: [{ file: evaluate, find: 'orderFor(body, input),', replace: '[],' }],
    tests,
  },
  {
    name: 'impact counts every field the order could choose',
    edits: [
      {
        file: impact,
        find: 'const reorders = touches(dependenciesOf(...order).fields)',
        replace: 'const reorders = touches(roles.order)',
      },
    ],
    tests,
    // Since e4ef152c a placement that leaves a row where it stood keeps the
    // list, so a change to a field the order could have chosen and did not is
    // placed and kept: the same answer, at the cost of the placement. The
    // narrower set is the cheaper path, not a different one.
    survives:
      'equivalent since e4ef152c: a field the order did not choose is placed where it stood, and the list kept',
  },
  {
    name: 'an orderBy may override the body',
    edits: [
      {
        file: drizzle,
        find: 'if (body !== undefined && body.orderBy.length > 0 && options.orderBy !== undefined) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'the compiler ignores a chosen order',
    edits: [{ file: compile, find: 'terms = Query.orderFor(body, input)', replace: 'terms = []' }],
    tests,
  },
  {
    name: 'an order is left without a tie-break',
    edits: [
      {
        file: expr,
        find: 'return endsOnId ? terms : [...terms, idTermOf(self.entity)]',
        replace: 'return terms',
      },
    ],
    tests,
  },
  {
    name: 'the id is appended to an order that reads it already',
    edits: [
      {
        file: expr,
        find: 'return endsOnId ? terms : [...terms, idTermOf(self.entity)]',
        replace: 'return [...terms, idTermOf(self.entity)]',
      },
    ],
    tests,
  },
]
