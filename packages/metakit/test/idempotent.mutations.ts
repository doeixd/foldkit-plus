/**
 * `Transition.idempotent`, rule by rule, and the `idempotent` row of each way
 * of writing with its generated check:
 *   `pnpm mutate packages/metakit/test/idempotent.mutations.ts`
 */
const commutes = '../src/transitionCommutes.ts'
const ways = '../src/ops/ways.ts'
const checks = '../src/writeChecks.ts'

const transitionTests = ['packages/metakit/test/transition-idempotent.test.ts']
const propertyTests = ['packages/metakit/test/properties-rows.test.ts']

const mutation = (
  tests: ReadonlyArray<string>,
  name: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  mutation(
    transitionTests,
    'rule 1: an opaque term is taken to be idempotent',
    commutes,
    '    Opaque: () => true,\n    Rows: rows => [Node.rowsSource(rows.over), ...Node.rowsBody(rows)].some(opaqueIn),',
    '    Opaque: () => false,\n    Rows: rows => [Node.rowsSource(rows.over), ...Node.rowsBody(rows)].some(opaqueIn),',
  ),
  mutation(
    transitionTests,
    'rule 2: a transition that emits records is taken to be idempotent',
    commutes,
    'if (x.emits.length > 0) return walk(',
    'if (false) return walk(',
  ),
  mutation(
    transitionTests,
    'rule 3: a read of a path the transition writes decides nothing',
    commutes,
    'const met = meetsAny(stateReads(x), x.writes.flatMap(writtenPaths))',
    'const met = undefined',
  ),
  mutation(
    transitionTests,
    'rule 4: an add or an append, which list no idempotence, is taken to be idempotent',
    commutes,
    'if (condition === undefined) {\n      return walk(`${ofWay(tag)}',
    'if (false) {\n      return walk(`${ofWay(tag)}',
  ),
  mutation(
    transitionTests,
    'rule 4: a patch that sets a field from itself is taken to be idempotent',
    commutes,
    "condition === 'sets-unread' &&",
    "condition === 'never' &&",
  ),
  mutation(
    propertyTests,
    'a patch is declared idempotent whatever it sets',
    ways,
    "  idempotent: 'sets-unread',",
    "  idempotent: 'always',",
  ),
  mutation(
    propertyTests,
    'an insert is no longer declared idempotent',
    ways,
    "  insert: { commutes: {}, idempotent: 'always' },",
    '  insert: { commutes: {} },',
  ),
  mutation(
    propertyTests,
    'the check of a declared idempotent way is skipped',
    checks,
    'if (properties.idempotent !== undefined) {',
    'if (false) {',
  ),
  mutation(
    propertyTests,
    'the check compares twice against twice',
    checks,
    'if (!same(outcome(state, write, write), once(state, write))) {',
    'if (!same(outcome(state, write, write), outcome(state, write, write))) {',
  ),
]
