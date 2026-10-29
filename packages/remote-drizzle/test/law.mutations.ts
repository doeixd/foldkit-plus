/**
 * The law, broken one interpreter at a time: each mutation makes the client
 * or the server answer otherwise, so the suite must find them disagreeing.
 * `pnpm mutate packages/remote-drizzle/test/law.mutations.ts`.
 *
 * Code both sides share (`Write.contextValues`, `Entity.judge`) is no
 * mutation here: broken alike on both sides, the two still agree, which is
 * why the law checks interpreters and not declarations.
 */
const tests = ['packages/remote-drizzle/test/law.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the client counts a new pointing row twice',
    '../../remote/src/mutation.ts',
    'count(to.value, owner, field, 1)',
    'count(to.value, owner, field, 2)',
  ),
  edit(
    'the client finds no row for an exists',
    '../../remote/src/mutation.ts',
    'at(to, owner).values[field] = bound.id',
    'at(to, owner).values[field] = null',
  ),
  edit(
    'the client predicts a moment late',
    '../../remote/src/index.ts',
    '              now: Option.fromUndefinedOr(options.now),',
    '              now: Option.map(Option.fromUndefinedOr(options.now), at => at + 1),',
  ),
  edit(
    'the client reads a path from the viewer through the wrong member',
    '../../remote/src/mutation.ts',
    '? Held.of(entry.values[key])',
    "? Held.of(entry.values['id'])",
  ),
  edit(
    'the client places pending rows without the viewer',
    '../../remote/src/index.ts',
    '        layersContext(layers),',
    '        undefined,',
  ),
  edit(
    'the client places a row by the order reversed',
    '../../remote/src/placement.ts',
    'if (sign.value < 0) {',
    'if (sign.value > 0) {',
  ),
  edit(
    'a refused write the client showed nothing of is a disagreement',
    '../../remote/src/law.ts',
    'if (predicted.size > 0)\n        compare(',
    'compare(',
  ),
  edit(
    'a check that compared nothing reports agreement',
    '../../remote/src/law.ts',
    'return agreed.length === 0 && disagreed.length === 0',
    'return false',
  ),
  edit(
    'a list the client foresaw nothing in is compared',
    '../../remote/src/law.ts',
    'for (const ref of predicted.size === 0 ? [] : lists) {',
    'for (const ref of lists) {',
  ),
  edit(
    'a write the client refused is not asked of the server',
    '../../remote/src/law.ts',
    "if (answer._tag === 'MutationFailed' && !sent) {",
    'if (false) {',
  ),
  edit(
    'the client refuses no write itself',
    '../../remote/src/index.ts',
    'write === undefined || options.optimistic !== undefined',
    'true',
  ),
  edit(
    'the server takes an increment away',
    '../src/index.ts',
    'set[key] = sql`${column} + ${amount}`',
    'set[key] = sql`${column} - ${amount}`',
  ),
]
