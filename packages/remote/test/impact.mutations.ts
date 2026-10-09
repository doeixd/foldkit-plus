/**
 * What a write does to held lists, broken in turn:
 * `pnpm mutate packages/remote/test/impact.mutations.ts`.
 */
const tests = ['packages/remote/test/impact.test.ts']
const impact = '../src/impact.ts'

export default [
  {
    name: 'no list is ever invalidated',
    edits: [
      {
        file: '../src/index.ts',
        find: "return changes.some(change => impactOn(held, visible, change)._tag === 'Invalidated')",
        replace: 'return false',
      },
    ],
    tests,
  },
  {
    name: 'every list of the Entity is invalidated',
    edits: [
      { file: impact, find: 'if (!touches(roles.predicate)) return kept', replace: '' },
      { file: impact, find: "if (held === (belongs === 'yes')) return kept", replace: '' },
    ],
    tests,
  },
  {
    name: 'an ordering change invalidates rows the list does not hold',
    edits: [
      {
        file: impact,
        find: 'if (held && touches(roles.order)) {',
        replace: 'if (touches(roles.order)) {',
      },
    ],
    tests,
  },
  {
    name: 'an ordering change is ignored',
    edits: [{ file: impact, find: 'if (held && touches(roles.order)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a row the client cannot judge is kept',
    edits: [{ file: impact, find: "if (belongs === 'unknown') {", replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'membership ignores whether the list held the row',
    edits: [
      {
        file: impact,
        find: "if (held === (belongs === 'yes')) return kept",
        replace: "if (belongs === 'yes') return kept",
      },
    ],
    tests,
  },
  {
    name: 'a query with no body is kept',
    edits: [
      {
        file: impact,
        find: 'if (body === undefined) {',
        replace: 'if (body === undefined) {\n        return kept',
      },
    ],
    tests,
  },
  {
    name: 'a deletion invalidates',
    edits: [
      {
        file: impact,
        find: 'Deleted: () => kept,',
        replace: "Deleted: () => Impact.Invalidated({ reason: 'deleted' }),",
      },
    ],
    tests,
  },
  {
    name: 'an invalidation leaves a read in flight running',
    edits: [
      {
        file: '../src/model.ts',
        find: 'return { ...marked, refresh: withRefreshRequested(marked.refresh, [], connections) }',
        replace: 'return marked',
      },
    ],
    tests: [...tests, 'packages/remote/test/liveBelongs.test.ts'],
  },
  {
    name: 'a list the answer names is judged anyway',
    edits: [
      { file: '../src/index.ts', find: 'if (named.has(identity)) return false', replace: '' },
    ],
    tests,
  },
  {
    name: 'a repeated value counts as a change',
    edits: [
      { file: impact, find: '!sameData(held[field], patch.values[field]),', replace: 'true,' },
    ],
    tests,
  },
  {
    name: 'a live invalidation leaves a read in flight running',
    edits: [
      {
        file: '../src/model.ts',
        find: ': invalidateConnections(next, [applied.invalidated])',
        replace:
          ": updateRemote(next, { _tag: 'ConnectionInvalidated', connection: applied.invalidated })",
      },
    ],
    tests: ['packages/remote/test/liveBelongs.test.ts'],
  },
]
