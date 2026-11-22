/** Mutations for `metakit/store` and `metakit/temporal`: the store refusal, the derived obligations and the walk. */
const file = '../src/temporal.ts'
const store = '../src/store.ts'
const proveMachine = '../src/prove/machine.ts'
const tests = ['packages/metakit/test/temporal.test.ts']

const mutation = (name: string, find: string, replace: string, at = file) => ({
  name,
  edits: [{ file: at, find, replace }],
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
    'an eventual store is taken to write a row as one step',
    "'row-atomic': store => store.isolation !== 'eventual',",
    "'row-atomic': () => true,",
    store,
  ),
  mutation(
    'mount lets a refused store through',
    'if (cannot.length > 0) throw new StoreRefused',
    'if (cannot.length < 0) throw new StoreRefused',
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
    'left.every((segment, at) => segment === right[at])',
    'left.length === right.length && left.every((segment, at) => segment === right[at])',
  ),
  mutation(
    'the proof report carries no obligations',
    'const obligations = Temporal.obligations(m)',
    'const obligations: ReturnType<typeof Temporal.obligations<State, Transitions>> = []',
    proveMachine,
  ),
  mutation('every run walks the first seed', 'const seed = first + run', 'const seed = first'),
  mutation(
    'a step runs before one it waits on',
    'const ready = waiting.filter(step => (step.after ?? []).every(name => ran.has(name)))',
    'const ready = waiting',
  ),
  mutation(
    'the property is asked only after the last step',
    'if (Option.isSome(reason)) {',
    'if (Option.isSome(reason) && at === order.length - 1) {',
  ),
  mutation(
    'shrinking drops a step another waits on',
    'if (rest.some(other => (other.after ?? []).includes(step.name))) continue',
    '',
  ),
  mutation(
    'the failing order is reported unshrunk',
    'const least = shrunk(failing.value)',
    'const least = failing.value',
  ),
  mutation(
    'a broken walk discharges its obligation',
    'discharges.filter(closes)',
    'discharges.filter(() => true)',
  ),
  mutation(
    'a scenario with no step of the obligation discharges it',
    'if (at < 0) {',
    'if (false) {',
  ),
  mutation('one step of a transition covers a pair of it', '    available.splice(at, 1)\n', ''),
]
