/**
 * A body over other rows judged over the store, each step broken in turn:
 * `pnpm mutate packages/remote/test/pathMatching.mutations.ts`.
 */
const tests = [
  'packages/remote/test/pathMatching.test.ts',
  'packages/remote/test/reachImpact.test.ts',
  'packages/remote-drizzle/test/law.test.ts',
]
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/matching.ts', find, replace }],
  tests,
})

export default [
  edit(
    'a body over a path is judged as one row alone',
    'const reaching = reachesOtherRows(body)',
    'const reaching = false',
  ),
  edit(
    'a row the store cannot follow is dropped, not skipped',
    '              skipped.push(row.__key)\n',
    '',
  ),
  edit(
    'what a path admits comes in the order it was held',
    'const judged = evaluateEach(reaching ? orderOnly(body) : body, encoded, admitted, {',
    'const judged = evaluateEach(reaching ? Relational.from(body.entity) : body, encoded, admitted, {',
  ),
  edit(
    'a path from the viewer is judged with no rows to start from',
    '        rows: holder.rows,\n',
    '',
  ),
]
