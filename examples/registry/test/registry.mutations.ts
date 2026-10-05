/**
 * The registry's own guards, each broken in turn: `pnpm mutate
 * examples/registry/test/registry.mutations.ts` checks that a test fails for
 * every one. The edit rules themselves are `foldkit-sync/entity`'s, and
 * `packages/sync/test/entity.mutations.ts` breaks those.
 */
const tests = ['examples/registry/test/page.test.ts']

export default [
  {
    name: 'a newly retired edit asks for no read',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'retiresAny(previous, retired) ? Products.refresh(kept) : kept',
        replace: 'kept',
      },
    ],
    tests,
  },
  {
    name: 'the replica is never named',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'mounted.dispatch(Message.ReplicaNamed({ replica: replica.replicaId }))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a reset reads no rows again',
    edits: [{ file: '../src/sync.ts', find: '      if (reset) {', replace: '      if (false) {' }],
    tests,
  },
  {
    name: 'no transition settles the retired edits',
    edits: [
      {
        file: '../src/app.ts',
        find: '  const settled = settledOf(next.model)',
        replace: '  const settled = next.model',
      },
    ],
    tests,
  },
  {
    name: 'nothing is retired',
    edits: [
      {
        file: '../src/app.ts',
        find: 'ProductEdits.held([...previous.retired, ...previous.edits], next.edits,',
        replace: 'ProductEdits.held([], next.edits,',
      },
    ],
    tests,
  },
  {
    name: 'a settled replacement is not said',
    edits: [
      {
        file: '../src/app.ts',
        find: 'replaced: before => [...before, ...replaced.map(replacementOf)],',
        replace: 'replaced: before => before,',
      },
    ],
    tests,
  },
  {
    name: 'a replacement in the slice is not said',
    edits: [
      {
        file: '../src/app.ts',
        find: 'ProductEdits.replaced(previous.edits, next.edits, next.replica).map(replacementOf)',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'a refusal names no cell',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'ProductEdits.cellsOf(changes).map(({ id, member }) => ({ id, column: member })),',
        replace: '[],',
      },
    ],
    tests,
  },
]
