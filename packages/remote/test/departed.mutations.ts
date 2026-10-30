/**
 * What a Surface left keeps, broken in turn:
 * `pnpm mutate packages/remote/test/departed.mutations.ts`
 */
const tests = ['packages/remote/test/departed.test.ts', 'packages/remote/test/noOp.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const model = '../src/model.ts'
const retain = '../src/retain.ts'

export default [
  edit(
    'only the active roots are kept',
    model,
    'const retained = gc(model, heldRoots(recent))',
    'const retained = gc(model, message.roots)',
  ),
  edit(
    'the roots are not remembered',
    model,
    '        recent,\n        evicted:',
    '        evicted:',
  ),
  edit(
    'a list left is not refetched',
    model,
    'ages === true\n              ? held\n              : setConnectionStale(held, identity, true),',
    'ages === true\n              ? held\n              : held,',
  ),
  edit(
    'a list still shown is marked stale too',
    model,
    'recent.departed\n        .flatMap(batch => batch.connections)',
    'heldRoots(recent).connections',
  ),
  edit(
    'nothing left is kept',
    retain,
    'const departed = batches.slice(oldestKept)',
    'const departed: ReadonlyArray<RetentionRoots> = []',
  ),
  edit(
    'the oldest left are kept instead of the newest',
    retain,
    'const departed = batches.slice(oldestKept)\n  const evicted = batches.slice(0, oldestKept)',
    'const departed = batches.slice(0, batches.length - oldestKept)\n  const evicted = batches.slice(batches.length - oldestKept)',
  ),
  edit(
    'what is left is kept without limit',
    model,
    'message.budget ?? defaultBudget',
    'message.budget ?? Infinity',
  ),
  edit(
    'unchanged roots are new roots',
    retain,
    'recent: unchanged ? previous : { active, departed },',
    'recent: { active, departed },',
  ),
]
