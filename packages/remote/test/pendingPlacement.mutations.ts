/**
 * Pending edits placed in the lists a read shows, broken in turn:
 * `pnpm mutate packages/remote/test/pendingPlacement.mutations.ts`.
 */
const tests = ['packages/remote/test/pendingPlacement.test.ts']
const index = '../src/index.ts'
const layers = '../src/layers.ts'
const placing = '../src/placing.ts'

export default [
  {
    name: 'a read shows the server’s pages as they are',
    edits: [
      {
        file: layers,
        find: 'const pages = pendingPlaced(lists, entities, optimistic, identity, connection)',
        replace: 'const pages = connection',
      },
    ],
    tests,
  },
  {
    name: 'filtering a list judges the server’s pages as they are',
    edits: [
      {
        file: '../src/filter.ts',
        find: ': inner.shown(remote, over.ref.identity, connection)',
        replace: ': edgesOf(domain[Capability], remote, over.ref.identity, connection)',
      },
      {
        file: '../src/filter.ts',
        find: "import { Capability, visibleOf } from './capability.js'",
        replace: "import { Capability, edgesOf, visibleOf } from './capability.js'",
      },
    ],
    tests,
  },
  {
    name: 'a row a pending edit brings in joins the list',
    edits: [
      {
        file: placing,
        find: 'if (!holds.has(entityKey(change.entity, change.id)) && !created) continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a placement is worked out and not shown',
    edits: [
      {
        file: placing,
        find: 'Placed: ({ connection }) => connection,',
        replace: 'Placed: () => placed,',
      },
    ],
    tests,
  },
  {
    name: 'every list is placed under one key',
    edits: [{ file: layers, find: '`placed:${identity}`', replace: "'placed'" }],
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
        find: '? placedNews(reduced, newsOf(message), remote.entities, contextOf(model))',
        replace: '? reduced',
      },
    ],
    tests,
  },
  {
    name: 'a row’s first read is judged too',
    edits: [
      {
        file: '../src/bodies.ts',
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
        file: '../src/bodies.ts',
        find: '  if (changes.length === 0) return placed\n',
        replace: '',
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
        file: '../src/bodies.ts',
        find: 'if (after !== pages) placed[identity] = after',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an inserted row stays where its overlay put it',
    edits: [{ file: layers, find: 'const placed = inserts', replace: 'const placed = false' }],
    tests,
  },
  {
    name: 'an inserted row placed before a loaded one stays at the front',
    edits: [
      {
        file: layers,
        find: 'Before: place => void (placed = withEdge(placed, edge, place)),',
        replace: 'Before: () => undefined,',
      },
    ],
    tests,
  },
  {
    name: 'an inserted row placed at the end stays at the front',
    edits: [
      {
        file: layers,
        find: 'End: place => void (placed = withEdge(placed, edge, place)),',
        replace: 'End: () => undefined,',
      },
    ],
    tests,
  },
  {
    name: 'an inserted row past what is loaded is shown',
    edits: [
      {
        file: layers,
        find: 'Outside: () => void outside.push(edge),',
        replace: 'Outside: () => undefined,',
      },
    ],
    tests,
  },
  {
    name: 'an insert of a row the pages hold places it twice',
    edits: [{ file: layers, find: 'if (held.has(edge.key)) continue', replace: '' }],
    tests,
  },
  {
    name: 'a removed row is placed too',
    edits: [
      {
        file: layers,
        find: "if (overlay.connection !== identity || overlay.position === 'remove') continue",
        replace: 'if (overlay.connection !== identity) continue',
      },
    ],
    tests,
    survives:
      'a row a remove names is hidden by `visibleItems` wherever it is placed; the filter spares placing it',
  },
]
