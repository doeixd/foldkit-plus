/**
 * What replicas converge on, read from the declaration, broken in turn:
 *   `pnpm mutate packages/sync/test/convergence.mutations.ts`
 * The tie-break of two sets of one field (`lww.ts`), `convergence` and
 * `settleConvergence`, the idempotence rule the todo list's copies are read
 * by, and the replica's removal of a committed operation it already holds.
 */
const registerTests = ['packages/sync/test/convergence.test.ts', 'packages/sync/test/lww.test.ts']
const readTests = ['packages/sync/test/convergenceRead.test.ts']
// The todo list's durable Messages through its real replica and journal.
const todoTests = ['examples/todo-app/test/sync.convergence.test.ts']

const mutation = (
  tests: ReadonlyArray<string>,
  name: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  mutation(
    registerTests,
    'the register drops its tie-break: at one logical time the write that arrived first wins',
    '../src/lww.ts',
    'return left.stamp.replicaId > right.stamp.replicaId ? left : right',
    'return left',
  ),
  mutation(
    [...readTests, ...todoTests],
    'a pair `commutes` does not decide is taken never to rebase',
    '../src/convergence.ts',
    "rebase: Verdict.isTrue(verdict) ? 'never' : 'possible',",
    "rebase: 'never',",
  ),
  mutation(
    [...readTests, ...todoTests],
    'a Message `idempotent` does not decide is taken to need no removal of its copy',
    '../src/convergence.ts',
    "Unknown: ({ reason }) => ({ tag, copy: 'removed by id' as const, why: reason }),",
    "Unknown: ({ reason }) => ({ tag, copy: 'harmless' as const, why: reason }),",
  ),
  mutation(
    readTests,
    'a walk that found the order mattering discharges its pair without saying so',
    '../src/convergence.ts',
    "? { answer: 'order-matters' as const }",
    '? {}',
  ),
  mutation(
    readTests,
    'a pair declared never to rebase is not refuted by a walk whose orders differ',
    '../src/convergence.ts',
    "checked:\n          orderMatters && Temporal.WalkResult.$is('Held')(result)",
    "checked:\n          false && Temporal.WalkResult.$is('Held')(result)",
  ),
  mutation(
    readTests,
    'a copy’s walk is not run',
    '../src/convergence.ts',
    'result: await options.walkRedelivery(tag, copy),',
    'result: Temporal.WalkResult.Held({ seed: 1, runs: 0 }),',
  ),
  mutation(
    todoTests,
    'a patch that sets a field from itself, a toggle, is taken to be idempotent',
    '../../metakit/src/transitionCommutes.ts',
    "condition === 'sets-unread' &&",
    'false &&',
  ),
  mutation(
    todoTests,
    'the replica applies an operation it already holds committed',
    '../src/sync.ts',
    '              if (operation.serverSequence <= cursor) continue\n',
    '',
  ),
  mutation(
    readTests,
    'a pair whose replicas diverged is closed as "the order matters"',
    '../src/convergence.ts',
    "...(orderMatters && Temporal.WalkResult.$is('Held')(result)",
    '...(orderMatters',
  ),
]
