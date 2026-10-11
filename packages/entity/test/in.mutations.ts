/**
 * `Expr.in`, broken in each interpreter in turn:
 * `pnpm mutate packages/entity/test/in.mutations.ts`.
 *
 * The conformance cases hold every interpreter to one meaning; the
 * differential test in `remote-server` holds the evaluator to SQLite's own
 * `in`, a list holding a null included.
 */
const evaluate = '../src/evaluate.ts'
const reference = [
  'packages/remote-server/test/conformance.test.ts',
  'packages/remote-server/test/evaluate.test.ts',
]

export default [
  {
    name: 'the evaluator reads an empty list as it reads any other',
    edits: [{ file: evaluate, find: 'if (among.length === 0) return false', replace: '' }],
    tests: reference,
  },
  {
    name: 'the evaluator compares a null value',
    edits: [{ file: evaluate, find: "if (isNull(value)) return 'unknown'", replace: '' }],
    tests: reference,
  },
  {
    name: 'the evaluator finds no match',
    edits: [
      { file: evaluate, find: 'if (among.some(each => each === value)) return true', replace: '' },
    ],
    tests: reference,
  },
  {
    name: 'the evaluator ignores a null in the list',
    edits: [
      {
        file: evaluate,
        find: "return among.some(isNull) ? 'unknown' : false",
        replace: 'return false',
      },
    ],
    tests: reference,
  },
  {
    name: 'the SQL compiler sends an empty list to the database',
    edits: [
      {
        file: '../../remote-drizzle/src/compile.ts',
        find: 'if (among.length === 0) return sql`false`',
        replace: '',
      },
    ],
    tests: ['packages/remote-drizzle/test/conformance.test.ts'],
  },
  {
    name: 'TanStack reads a null against an empty list as unknown',
    edits: [
      {
        file: '../../../examples/tanstack/src/interpreter.ts',
        find: 'if (Array.isArray(among) && among.length === 0) return eq(0 as never, 1 as never)',
        replace: '',
      },
    ],
    tests: ['examples/tanstack/test/conformance.test.ts'],
  },
]
