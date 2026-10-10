/**
 * Where rows without a value go, broken in turn, in the IR, the reference
 * evaluator and the Drizzle order and keyset:
 * `pnpm mutate packages/remote-drizzle/test/nulls.mutations.ts`.
 */
const tests = [
  'packages/entity/test/expr.test.ts',
  'packages/entity/test/query-values.test.ts',
  'packages/remote-server/test/evaluate.test.ts',
  'packages/remote-drizzle/test/conformance.test.ts',
]
const expr = '../../entity/src/expr.ts'
const evaluate = '../../entity/src/evaluate.ts'
const cursor = '../src/cursor.ts'

export default [
  {
    name: 'every term puts nulls last',
    edits: [
      {
        file: expr,
        find: "nulls: options.nulls ?? (direction === 'asc' ? 'last' : 'first'),",
        replace: "nulls: options.nulls ?? 'last',",
      },
    ],
    tests,
  },
  {
    name: 'a term asking for nulls first is not heard',
    edits: [
      {
        file: expr,
        find: "nulls: options.nulls ?? (direction === 'asc' ? 'last' : 'first'),",
        replace: "nulls: direction === 'asc' ? 'last' : 'first',",
      },
    ],
    tests,
  },
  {
    name: 'the evaluator puts nulls last whatever the term says',
    edits: [
      {
        file: evaluate,
        find: "return absentLeft === (term.nulls === 'first') ? -1 : 1",
        replace: 'return absentLeft ? 1 : -1',
      },
    ],
    tests,
  },
  {
    name: 'the ORDER BY leaves nulls to the database',
    edits: [
      {
        file: cursor,
        find: 'const last = nullsLast(term) === forward',
        replace: 'const last = true',
      },
    ],
    tests,
  },
  {
    name: 'a page after a value never reaches the nulls after it',
    edits: [
      {
        file: cursor,
        find: 'return forward === last ? or(beyond, isNull(column))! : beyond',
        replace: 'return beyond',
      },
    ],
    tests,
  },
  {
    name: 'a page after a null cursor takes every row with a value',
    edits: [
      {
        file: cursor,
        find: 'if (value === null) return forward === last ? sql`false` : isNotNull(column)',
        replace: 'if (value === null) return isNotNull(column)',
      },
    ],
    tests,
  },
]
