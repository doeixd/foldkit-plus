/**
 * Pending edits placed in the lists a read shows, broken in turn:
 * `pnpm mutate packages/remote/test/pendingPlacement.mutations.ts`.
 */
const tests = ['packages/remote/test/pendingPlacement.test.ts']
const index = '../src/index.ts'

export default [
  {
    name: 'a read shows the server’s pages as they are',
    edits: [
      {
        file: index,
        find: 'pendingPlaced(remote, ref.identity, connection),',
        replace: 'connection,',
      },
    ],
    tests,
  },
  {
    name: 'filtering a list judges the server’s pages as they are',
    edits: [
      {
        file: index,
        find: 'pendingPlaced(remote, over.ref.identity, connection),',
        replace: 'connection,',
      },
    ],
    tests,
  },
  {
    name: 'a row a pending edit brings in joins the list',
    edits: [
      {
        file: index,
        find: 'if (!holds.has(entityKey(change.entity, change.id))) continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a placement is worked out and not shown',
    edits: [
      {
        file: index,
        find: 'Placed: ({ connection }) => connection,',
        replace: 'Placed: () => placed,',
      },
    ],
    tests,
  },
  {
    name: 'every list is placed under one key',
    edits: [{ file: index, find: '`placed:${identity}`', replace: "'placed'" }],
    tests,
    survives:
      'each list’s pages are already a scope of their own; the identity keeps two lists apart only should they share one Connection value',
  },
  {
    name: 'a read is not placed',
    edits: [
      {
        file: index,
        find: "if (message._tag === 'ReadReceived') return message.result.entities",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a live patch is not placed',
    edits: [
      { file: index, find: "if (event._tag !== 'EntityPatched') return []", replace: 'return []' },
    ],
    tests,
  },
  {
    name: 'news is not placed at all',
    edits: [
      {
        file: index,
        find: '? placedNews(reduced, newsOf(message), remote.entities)',
        replace: '? reduced',
      },
    ],
    tests,
  },
  {
    name: 'a row’s first read is judged too',
    edits: [
      {
        file: index,
        find: '.filter(([field]) => Object.hasOwn(values, field)),',
        replace: ',',
      },
    ],
    tests,
    survives:
      'a first read writes values the pages were read in, so placing them finds each row where it is; the filter spares judging every row of a first page',
  },
  {
    name: 'a read with nothing new judges every list anyway',
    edits: [
      {
        file: index,
        find: 'if (changes.length === 0) return remote\n    const placed',
        replace: 'const placed',
      },
    ],
    tests,
    survives:
      'with no change, every list is left as it was; the return spares parsing each identity',
  },
  {
    name: 'a placed list is left out of the Model',
    edits: [
      {
        file: index,
        find: 'if (after !== pages) placed[identity] = after',
        replace: '',
      },
    ],
    tests,
  },
]
