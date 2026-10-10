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
const expr = '../src/expr.ts'
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
        file: expr,
        find: 'for (const choice of Object.values(expr.choices)) walk(choice, found)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a choice of another Entity is accepted',
    edits: [
      {
        file: expr,
        find: 'for (const choice of Object.values(expr.choices)) yield* fieldsIn(choice, seen)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the evaluator ignores the order',
    edits: [{ file: evaluate, find: 'Query.orderFor(body, input),', replace: '[],' }],
    tests,
  },
  {
    name: 'impact counts every field the order could choose',
    edits: [
      {
        file: impact,
        find: 'if (held && touches(dependenciesOf(...order).fields)) {',
        replace: 'if (held && touches(roles.order)) {',
      },
    ],
    tests,
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
      { file: expr, find: 'return endsOnId ? terms : [...terms, id]', replace: 'return terms' },
    ],
    tests,
  },
  {
    name: 'the id is appended to an order that reads it already',
    edits: [
      {
        file: expr,
        find: 'return endsOnId ? terms : [...terms, id]',
        replace: 'return [...terms, id]',
      },
    ],
    tests,
  },
]
