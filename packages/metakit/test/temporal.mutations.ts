/** Mutations for `@doeixd/metakit/store` and `@doeixd/metakit/temporal`: the store refusal, the derived obligations and the walk. */
const file = '../src/temporal.ts'
const store = '../src/store.ts'
const proveMachine = '../src/prove/machine.ts'
const tests = ['packages/metakit/test/temporal.test.ts']

// `all`: `walk` and `walkAsync` repeat these lines, and a mutation breaks both.
const mutation = (name: string, find: string, replace: string, at = file, all = false) => ({
  name,
  edits: [{ file: at, find, replace, all }],
  tests,
})

export default [
  mutation(
    'a read-committed store with no parent lock is taken to serialize a parent',
    "(store.isolation === 'read-committed' && store.parentRowLock)",
    "store.isolation === 'read-committed'",
    store,
  ),
  mutation(
    'a parent lock is taken to serialize a parent on an eventual store',
    "(store.isolation === 'read-committed' && store.parentRowLock)",
    'store.parentRowLock',
    store,
  ),
  mutation(
    'a rule read before the write is taken to hold on a store isolating one statement',
    "(judged === 'in-statement' || store.isolates === 'transaction') &&",
    '',
    store,
  ),
  mutation(
    'a rule judged in the statement is refused on a store isolating one statement',
    "(judged === 'in-statement' || store.isolates === 'transaction') &&",
    "store.isolates === 'transaction' &&",
    store,
  ),
  mutation(
    'a store that does not say is taken to isolate a transaction',
    "(judged === 'in-statement' || store.isolates === 'transaction') &&",
    "(judged === 'in-statement' || store.isolates !== 'statement') &&",
    store,
  ),
  mutation(
    'refused forgets where each rule is judged',
    'needed.filter(({ needs, judged }) => !gives(store, needs, judged))',
    'needed.filter(({ needs }) => !gives(store, needs))',
    store,
  ),
  mutation(
    'an eventual store is taken to write a row as one step',
    "    store.isolation !== 'eventual' &&\n    (judged !== 'read-first' ||",
    "    (judged !== 'read-first' ||",
    store,
  ),
  mutation(
    'a row read before the write is taken to be the row written',
    "      (store.isolates === 'transaction' && store.isolation === 'serializable')),",
    '      true),',
    store,
  ),
  mutation(
    'a row read first at read committed is taken to be the row written',
    "      (store.isolates === 'transaction' && store.isolation === 'serializable')),",
    "      store.isolates === 'transaction'),",
    store,
  ),
  mutation(
    'a row checked in the statement is taken to have moved',
    "    (judged !== 'read-first' ||\n      (store.isolates",
    '    ((store.isolates',
    store,
  ),
  mutation(
    'a constraint is taken to hold on an eventual store',
    "      ? store.isolation !== 'eventual'",
    '      ? true',
    store,
  ),
  mutation(
    'a constraint is judged as a read before the write',
    "    judged === 'constraint'\n      ?",
    "    judged === 'never'\n      ?",
    store,
  ),
  mutation(
    'mount lets a refused store through',
    'return cannot.length > 0 ? Result.fail(new StoreRefused({ store, refused: cannot })) : Result.void',
    'return cannot.length < 0 ? Result.fail(new StoreRefused({ store, refused: cannot })) : Result.void',
    store,
  ),
  mutation(
    'a blind write into a ruled state asks nothing',
    'if (!readsState && !ruled) continue',
    'if (!readsState) continue',
  ),
  mutation(
    'a blind write into a state with no rules asks row-atomic',
    'if (!readsState && !ruled) continue',
    '',
  ),
  mutation(
    'a key naming a transition and an aggregate is taken twice',
    'if (machine !== undefined && Object.hasOwn(machine.transitions, key)) {',
    'if (false) {',
  ),
  mutation(
    'every pair of transitions is owed a walk',
    '.filter(([, b]) => disturbs(a, b) || disturbs(b, a))',
    '.filter(() => true)',
  ),
  mutation(
    'a write under a path does not disturb a read of it',
    'Path.meets(left, right)',
    'left.length === right.length && left.every((segment, at) => segment === right[at])',
  ),
  mutation(
    'the proof report carries no obligations',
    'const obligations = Temporal.obligations(m)',
    'const obligations: ReturnType<typeof Temporal.obligations<State, Transitions>> = []',
    proveMachine,
  ),
  mutation(
    'every run walks the first seed',
    'const seed = first + run',
    'const seed = first',
    file,
    true,
  ),
  mutation(
    'a step runs before one it waits on',
    'const ready = waiting.filter(step => (step.after ?? []).every(name => ran.has(name)))',
    'const ready = waiting',
    file,
    true,
  ),
  mutation(
    'the property is asked only after the last step',
    'if (Option.isSome(reason)) {',
    'if (Option.isSome(reason) && at === order.length - 1) {',
    file,
    true,
  ),
  mutation(
    'shrinking drops a step another waits on',
    'if (rest.some(other => (other.after ?? []).includes(step.name))) continue',
    '',
    file,
    true,
  ),
  mutation(
    'the failing order is reported unshrunk',
    'const least = shrunk(failing.value)',
    'const least = failing.value',
  ),
  mutation(
    'a broken walk discharges its obligation',
    'return broke(walks) !== undefined || !walks.some(walk => closes(owned, walk))',
    "return !walks.some(walk => closes(owned, walk) || WalkResult.$is('Broken')(walk.result))",
  ),
  mutation(
    'a scenario with no step of the obligation discharges it',
    'if (at < 0) {',
    'if (false) {',
  ),
  mutation('one step of a transition covers a pair of it', '    available.splice(at, 1)\n', ''),
]
