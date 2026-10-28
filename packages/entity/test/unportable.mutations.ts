/**
 * NaN refused, and a `where` list asked whole, broken in turn:
 * `pnpm mutate packages/entity/test/unportable.mutations.ts` checks that a
 * test fails for every one.
 */
const evaluate = '../src/evaluate.ts'
const compile = '../../remote-drizzle/src/compile.ts'
const unportable = ['packages/entity/test/unportable.test.ts']
const sql = ['packages/remote-drizzle/test/conformance.test.ts']

export default [
  {
    name: 'a where list stops at its first predicate that fails',
    edits: [
      {
        file: evaluate,
        find: '  body.where\n    .map(node =>',
        replace: '  body.where\n    .slice(0, 1)\n    .map(node =>',
      },
    ],
    tests: unportable,
  },
  {
    name: 'an order sorts by a NaN key',
    edits: [
      {
        file: evaluate,
        find: '    if (isNaNValue(key)) throw refusedNaN(`an order by ${Expr.show(term.expr)}`)',
        replace: '',
      },
    ],
    tests: unportable,
  },
  {
    name: 'a comparison compares a stored NaN',
    edits: [
      {
        file: evaluate,
        find: "      if (isNaNValue(left) || isNaNValue(right)) throw refusedNaN('a comparison')",
        replace: '',
      },
    ],
    tests: unportable,
  },
  {
    name: 'an equality compares a stored NaN',
    edits: [
      {
        file: evaluate,
        find: "      if (isNaNValue(left) || isNaNValue(right)) throw refusedNaN('an equality')",
        replace: '',
      },
    ],
    tests: unportable,
  },
  {
    name: 'a membership test compares NaN',
    edits: [
      {
        file: evaluate,
        find: "      if (isNaNValue(value) || among.some(isNaNValue)) throw refusedNaN('a membership test')",
        replace: '',
      },
    ],
    tests: unportable,
  },
  {
    name: 'a given NaN beside a null is not refused',
    edits: [
      {
        file: evaluate,
        find: "      refuseGivenNaN('a comparison', [",
        replace: "      ;(() => undefined)('a comparison', [",
      },
    ],
    tests: unportable,
  },
  {
    name: 'a given NaN refuses each row, not the run',
    edits: [
      {
        file: evaluate,
        find: '    const unportable = (each: unknown) => holdsNul(each) || isNaNValue(each)',
        replace: '    const unportable = holdsNul',
      },
    ],
    tests: unportable,
  },
  {
    name: 'SQL compares a NaN parameter',
    edits: [
      {
        file: compile,
        find: '  }\n  refuseNaN(query, [left, right])\n  const symbol',
        replace: '  }\n  const symbol',
      },
    ],
    tests: sql,
  },
  {
    name: 'SQL tests equality with a NaN parameter',
    edits: [
      {
        file: compile,
        find: '      }\n      refuseNaN(query, [left, right])\n      // Drizzle',
        replace: '      }\n      // Drizzle',
      },
    ],
    tests: sql,
  },
  {
    name: 'SQL tests membership in a list holding NaN',
    edits: [{ file: compile, find: '      refuseNaN(query, [value, ...among])', replace: '' }],
    tests: sql,
  },
]
