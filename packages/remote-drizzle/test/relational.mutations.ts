/**
 * Paths and exists in SQL, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/relational.mutations.ts` checks
 * that a test fails for every one.
 */
const compile = '../src/compile.ts'
const index = '../src/index.ts'
const evaluate = '../../entity/src/evaluate.ts'
const conformance = ['packages/remote-drizzle/test/conformance.test.ts']
const registration = ['packages/remote-drizzle/test/relational.test.ts']

export default [
  {
    name: 'a path reads a row its reader may not see',
    edits: [
      {
        file: compile,
        find: '    onSome: rule => sql`${at} and (${rule})`,',
        replace: '    onSome: () => at,',
      },
    ],
    tests: conformance,
  },
  {
    name: 'an exists finds a row its reader may not see',
    edits: [
      {
        file: compile,
        find: '    ...Option.toArray(Option.map(visibleIn(anchor, owner, query), rule => sql`(${rule})`)),',
        replace: '',
      },
    ],
    tests: conformance,
  },
  {
    name: "a request leaves a reached table's rule unresolved",
    edits: [
      {
        file: index,
        find: '        seen.set(owner.token, Option.fromUndefinedOr(yield* visibleFor(reached.value, principal)))',
        replace: '        seen.set(owner.token, Option.none())',
      },
    ],
    tests: conformance,
  },
  {
    name: 'compiling without the reader reads every row of a reached table',
    edits: [
      {
        file: compile,
        find: '    Option.fromUndefinedOr(target.visibleOf),',
        replace: '    Option.some(target.visibleOf ?? (() => Option.none())),',
      },
    ],
    tests: registration,
  },
  {
    name: 'a table met twice is compiled without an alias',
    edits: [
      { file: compile, find: '    if (met.includes(table.table)) {', replace: '    if (false) {' },
    ],
    tests: registration,
  },
  {
    name: 'a body may not use a path',
    edits: [
      {
        file: compile,
        find: "const bodyOperations: ReadonlyArray<Operation> = [...supported, 'path', 'exists']",
        replace: 'const bodyOperations: ReadonlyArray<Operation> = supported',
      },
    ],
    tests: [...conformance, ...registration],
  },
  {
    name: 'a predicate over another row is decided as if it read none',
    edits: [
      {
        file: evaluate,
        find: '      field: read.fields.length + read.next.length + read.reaches.length > 0,',
        replace: '      field: read.fields.length + read.next.length > 0,',
      },
    ],
    tests: conformance,
  },
]
