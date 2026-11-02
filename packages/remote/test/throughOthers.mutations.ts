/**
 * Lists judged again when a write reaches what their body reads through other
 * rows (#344), broken in turn:
 * `pnpm mutate packages/remote/test/throughOthers.mutations.ts`.
 */
const tests = ['packages/remote/test/throughOthers.test.ts']
const law = [
  'packages/remote-server/test/existsLaw.test.ts',
  'packages/remote-drizzle/test/law.test.ts',
]
const held = '../src/held.ts'
const impact = '../src/impact.ts'
const layers = '../src/layers.ts'
const bodies = '../src/bodies.ts'

export default [
  {
    name: 'the store never holds a row pointing at another',
    edits: [
      { file: held, find: 'rows: pointersOf(relation).get(at) ?? [],', replace: 'rows: [],' },
    ],
    tests: [...tests, ...law],
  },
  {
    name: 'a stale link counts as pointing',
    edits: [
      { file: held, find: '      if (entry.stale.has(relation.key)) continue\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'a pending layer never judges a list again',
    edits: [
      {
        file: layers,
        find: 'if (body === undefined || !changes.some(change => readsThrough(body, change)))',
        replace: 'if (body === undefined || changes.length >= 0)',
      },
    ],
    tests: [...tests, ...law],
  },
  {
    name: 'a pending delete is no change',
    edits: [
      {
        file: layers,
        find: '        deleted: layers.flatMap(layer => layer.deletes),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a row the body no longer admits stays',
    edits: [
      { file: impact, find: 'pages = withoutEdge(pages, held.key)', replace: 'pages = pages' },
    ],
    tests,
  },
  {
    name: 'a row joins a list its server filters',
    edits: [
      { file: impact, find: '  if (connection.filtered.length > 0) return pages\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'a row the store cannot judge joins',
    edits: [
      {
        file: impact,
        find: "holds.has(key) || belongs(key) !== 'yes')",
        replace: "holds.has(key) || belongs(key) === 'no')",
      },
    ],
    tests,
  },
  {
    name: 'a row the list holds joins it again',
    edits: [
      {
        file: impact,
        find: "holds.has(key) || belongs(key) !== 'yes')",
        replace: "belongs(key) !== 'yes')",
      },
    ],
    tests,
  },
  {
    name: 'an answer judges a change through other rows as its own',
    edits: [{ file: bodies, find: '      if (through(change)) continue\n', replace: '' }],
    tests,
  },
  {
    name: 'an answer does not judge a list again',
    edits: [
      {
        file: bodies,
        find: '    if (judged.some(through)) {',
        replace: '    if (judged.length < 0) {',
      },
    ],
    tests,
  },
  {
    name: 'a list an answer judged again is not fetched',
    edits: [
      {
        file: bodies,
        find: '      pages = rejudged({ ...query.value, connection: pages, holds }, visible, operators, context)\n      invalidated.push(identity)',
        replace:
          '      pages = rejudged({ ...query.value, connection: pages, holds }, visible, operators, context)',
      },
    ],
    tests,
  },
  {
    name: 'the law compares a list holding a row the client cannot judge',
    edits: [
      {
        file: '../src/law.ts',
        find: 'const judged = [...predicted.keys(), ...shownKeys].every(',
        replace: 'const judged = [...predicted.keys()].every(',
      },
    ],
    tests: law,
  },
]
