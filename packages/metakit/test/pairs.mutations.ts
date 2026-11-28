/**
 * `@doeixd/metakit/pairs` and the registry in `@doeixd/metakit/temporal`, each broken in turn:
 *   `pnpm mutate packages/metakit/test/pairs.mutations.ts`
 *
 * The two that declare a way of writing commutative are the hazard the plan
 * names, "a pair decided True wrongly": the walk run over a decided pair turns
 * red. The first is caught by the notebook of `pairs.test.ts`, the second by
 * the todo app's own walks.
 */
const pairs = '../src/pairs.ts'
const temporal = '../src/temporal.ts'
const properties = '../src/ops/ways.ts'
const tests = ['packages/metakit/test/pairs.test.ts']

const mutation = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  mutation(
    'append is declared commutative, so two appends are decided and the walk of the decision is red',
    properties,
    'append: { commutes: {} },',
    "append: { commutes: { append: 'always' } },",
  ),
  {
    name: 'insert is declared commutative, so the todo app decides its inserts and a walk turns red',
    edits: [
      {
        file: properties,
        find: "insert: { commutes: {}, idempotent: 'always' },",
        replace: "insert: { commutes: { insert: 'always' }, idempotent: 'always' },",
      },
    ],
    tests: ['examples/todo-app/test/pairs.test.ts'],
  },
  mutation(
    'the walk never reports a difference',
    pairs,
    'if (canonical(forward) !== canonical(backward)) {',
    "if (canonical(forward) === 'never') {",
  ),
  mutation(
    'the records emitted are not compared',
    pairs,
    'return { state: at, emitted: emitted.sort(), refused: refused.sort() }',
    'return { state: at, emitted: [], refused: refused.sort() }',
  ),
  mutation(
    'a refusal is not told by which Message was refused',
    pairs,
    'refused.push(canonical(step))',
    "refused.push('')",
  ),
  mutation(
    'a generated Message is never drawn toward the rows of the state',
    pairs,
    'if (pick.length === 0 || next() > 0.75) continue',
    'continue',
  ),
  mutation(
    'every run of a walk uses the first seed',
    pairs,
    'const seed = firstSeed + run',
    'const seed = firstSeed',
  ),
  mutation(
    'a replacement the Schema refuses is kept',
    pairs,
    'if (accepts(candidate)) current = candidate',
    'current = candidate',
  ),
  mutation(
    'a pair that does not decide is left out of the obligations',
    pairs,
    'Verdict.isTrue(pair.verdict)\n      ? []',
    'false\n      ? []',
  ),
  mutation(
    'the report is ok while a decision is refuted',
    temporal,
    'ok: open.length === 0 && refuted.length === 0,',
    'ok: open.length === 0,',
  ),
  mutation(
    'the report is ok while an obligation is open',
    temporal,
    'ok: open.length === 0 && refuted.length === 0,',
    'ok: refuted.length === 0,',
  ),
  mutation(
    'a walk that found the order matters does not discharge its obligation',
    temporal,
    "WalkResult.$is('Held')(result) || answer !== undefined",
    "WalkResult.$is('Held')(result)",
  ),
  mutation(
    'a walk that broke discharges its obligation',
    temporal,
    "WalkResult.$is('Held')(result) || answer !== undefined",
    'true',
  ),
  mutation(
    'an obligation is declared where its declaring code is not named',
    temporal,
    'where: scope.where ?? callerOf(),',
    "where: scope.where ?? 'unknown',",
  ),
  mutation(
    'a name declared again from another place replaces the first',
    temporal,
    'if (before !== undefined && before.scope.where !== at.where) {',
    'if (before !== undefined && before.scope.where === at.where + at.where) {',
  ),
  mutation(
    'a discharge of an obligation nobody declared is taken',
    temporal,
    'if (!owed.has(key)) {',
    'if (owed.has(key) && !owed.has(key)) {',
  ),
  mutation(
    'a decided pair a walk broke is not refuted',
    temporal,
    "Option.isSome(checked) && WalkResult.$is('Broken')(checked.value),",
    "Option.isSome(checked) && WalkResult.$is('Held')(checked.value),",
  ),
  {
    name: 'a pair whose walk sampled no state is closed as "the order matters"',
    edits: [
      {
        file: pairs,
        find: "Temporal.WalkResult.$is('Broken')(result) && result.reason !== unsampled",
        replace: "Temporal.WalkResult.$is('Broken')(result)",
      },
    ],
    tests: ['packages/metakit/test/pairs.unsampled.test.ts'],
  },
]
