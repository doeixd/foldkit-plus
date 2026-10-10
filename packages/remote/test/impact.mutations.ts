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
        find: 'if (invalid) invalidated.push(identity)',
        replace: 'if (false) invalidated.push(identity)',
      },
    ],
    tests,
  },
  {
    name: 'a placement is worked out and not kept',
    edits: [
      {
        file: '../src/index.ts',
        find: 'else if (pages !== original) placed[identity] = pages',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a change to no field a list reads is judged anyway',
    edits: [
      {
        file: impact,
        find: 'if (!(held && reorders) && !refilters && !joins) return kept',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an ordering change is ignored',
    edits: [
      {
        file: impact,
        find: 'const reorders = touches(dependenciesOf(...order).fields)',
        replace: 'const reorders = false',
      },
    ],
    tests,
  },
  {
    name: 'an ordering change of a row the list does not hold counts',
    edits: [
      {
        file: impact,
        find: 'if (!(held && reorders) && !refilters && !joins) return kept',
        replace: 'if (!reorders && !refilters && !joins) return kept',
      },
    ],
    tests,
  },
  {
    name: 'a held row that still matches is placed again',
    edits: [
      {
        file: impact,
        find: "if (held && belongs === 'yes' && !reorders) return kept",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a row shown by an overlay is placed in the pages anyway',
    edits: [{ file: impact, find: 'if (held && !inPages) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a row that stops matching stays',
    edits: [
      {
        file: impact,
        find: "if (belongs === 'no') return Impact.Placed({ connection: withoutEdge(pages, key) })",
        replace: "if (belongs === 'no') return kept",
      },
    ],
    tests,
  },
  {
    name: 'a held row moved past what is loaded stays',
    edits: [
      {
        file: impact,
        find: 'Outside: () => (held ? Impact.Placed({ connection: withoutEdge(pages, key) }) : kept),',
        replace: 'Outside: () => kept,',
      },
    ],
    tests,
  },
  {
    name: 'a row that cannot be placed is kept',
    edits: [
      {
        file: impact,
        find: 'Unknown: ({ reason }) =>',
        replace: 'Unknown: ({ reason }) => (void reason, kept) ||',
      },
    ],
    tests,
  },
  {
    name: 'a row the client cannot judge is kept',
    edits: [{ file: impact, find: "if (belongs === 'unknown') {", replace: 'if (false) {' }],
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
    edits: [{ file: '../src/index.ts', find: 'if (named.has(identity)) continue', replace: '' }],
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
  {
    name: 'a body that leaves its order to the server keeps a held row that changed',
    edits: [
      { file: impact, find: 'if (held && body.orderBy.length === 0) {', replace: 'if (false) {' },
    ],
    tests,
  },
  {
    name: 'a server-ordered list is invalidated by a row it does not hold',
    edits: [
      {
        file: impact,
        find: 'if (held && body.orderBy.length === 0) {',
        replace: 'if (body.orderBy.length === 0) {',
      },
    ],
    tests,
  },
  {
    name: 'a row new to the client joins no list it filters nothing for',
    edits: [
      {
        file: impact,
        find: 'const joins = !held && (created || (reorders && unloaded))',
        replace: 'const joins = !held && reorders && unloaded',
      },
    ],
    tests,
  },
  {
    name: 'a row past a cursor cannot move into the loaded rows',
    edits: [
      {
        file: impact,
        find: 'const joins = !held && (created || (reorders && unloaded))',
        replace: 'const joins = !held && created',
      },
    ],
    tests,
  },
  {
    name: 'a list loaded whole judges a row it does not hold',
    edits: [
      {
        file: impact,
        find: 'const unloaded = hasPrevious(pages) || hasNext(pages) || isGapped(pages)',
        replace: 'const unloaded = true',
      },
    ],
    tests,
  },
  {
    name: 'a row a list does not hold is taken to belong',
    edits: [{ file: impact, find: "held && !refilters ? 'yes'", replace: "!refilters ? 'yes'" }],
    tests,
  },
  {
    name: 'every row is new to the client',
    edits: [{ file: impact, find: 'created: held === undefined,', replace: 'created: true,' }],
    tests,
  },
]
