/**
 * Query dependencies by role, broken in turn:
 * `pnpm mutate packages/entity/test/dependencies.mutations.ts`.
 */
const tests = ['packages/entity/test/expr.test.ts']
const expr = '../src/expr.ts'

export default [
  {
    name: 'predicate fields include the ordering',
    edits: [
      {
        file: expr,
        find: 'predicate: dependenciesOf(...self.where).fields,',
        replace: 'predicate: dependenciesOf(...self.where, ...self.orderBy).fields,',
      },
    ],
    tests,
  },
  {
    name: 'order fields include the predicates',
    edits: [
      {
        file: expr,
        find: 'order: dependenciesOf(...self.orderBy).fields,',
        replace: 'order: dependenciesOf(...self.where, ...self.orderBy).fields,',
      },
    ],
    tests,
  },
  {
    name: 'the roles are swapped',
    edits: [
      {
        file: expr,
        find: 'predicate: dependenciesOf(...self.where).fields,',
        replace: 'predicate: dependenciesOf(...self.orderBy).fields,',
      },
    ],
    tests,
  },
]
