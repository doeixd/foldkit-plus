/**
 * A body over the context, compiled to SQL and run by the memory server, each
 * step broken in turn: `pnpm mutate packages/remote-drizzle/test/contextTerms.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/contextTerms.test.ts']
const server = '../../remote-server/src/index.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the query is compiled with no context',
    '../src/index.ts',
    '                context: exprContext(body, viewer, yield* Clock.currentTimeMillis),\n',
    '',
  ),
  edit(
    'the server gives a query no viewer',
    server,
    '            viewer: viewerOf(server, caller),\n            ...(select === undefined ? {} : { select }),',
    '            ...(select === undefined ? {} : { select }),',
  ),
  edit(
    'a run outside a server reads a visitor',
    server,
    "if (viewer === undefined && Query.dependencies(body).operations.includes('viewer')) {",
    'if (false) {',
  ),
  edit(
    'the server reads the time as the epoch',
    server,
    'return { viewer: viewer ?? Option.none(), now: Option.some(now) }',
    'return { viewer: viewer ?? Option.none(), now: Option.some(0) }',
  ),
  {
    ...edit(
      'a predicate over the context alone is left to SQL',
      '../src/compile.ts',
      'return decided(node, input, operatorsOf(target).memory, target.context)',
      'return decided(node, input, operatorsOf(target).memory)',
    ),
    // SQLite compares two bound parameters as the values they are, so `? = ?`
    // answers as deciding it would; deciding it keeps it from Postgres, which
    // types neither side.
    survives: 'equivalent on SQLite, which compares two parameters by value',
  },
  edit(
    'the memory server evaluates with no context',
    server,
    'const matched = evaluate(body, encoded, rows, { operators, context })',
    'const matched = evaluate(body, encoded, rows, { operators })',
  ),
]
