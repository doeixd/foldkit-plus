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
const whole = '../src/whole.ts'

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
    name: 'a change through other rows does not move its own row',
    edits: [
      {
        file: impact,
        find: '  if (body.entity.name !== change.entity) return kept\n',
        replace:
          "  if (readsThrough(body, change)) return Impact.Invalidated({ reason: 'through' })\n  if (body.entity.name !== change.entity) return kept\n",
      },
    ],
    tests,
  },
  {
    name: 'an answer judges a list again over what it held before placing',
    edits: [{ file: bodies, find: 'holds: now }', replace: 'holds }' }],
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
        find: '        whole,\n      })\n      invalidated.set(',
        replace: '        whole,\n      })\n      new Map<string, string>().set(',
      },
    ],
    tests,
  },
  {
    name: 'a list held whole never decides an exists',
    edits: [
      { file: held, find: 'missing: holdsEvery(relation, pinned)', replace: 'missing: false' },
    ],
    tests: [...tests, ...law],
  },
  {
    name: 'a list held whole decides an exists whatever its body fixes',
    edits: [
      {
        file: held,
        find: '[...list.pins].every(([key, value]) => pinned.get(key) === value)',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a row of a list held whole whose link the store lacks counts as held',
    edits: [{ file: held, find: '(entry.present.has(relation.key) && ', replace: '(' }],
    tests,
  },
  {
    name: 'a row of a list held whole whose link is stale counts as held',
    edits: [{ file: held, find: ' && !entry.stale.has(relation.key)))', replace: '))' }],
    tests,
  },
  {
    name: 'a list with more to load is held whole',
    edits: [{ file: whole, find: "only.end._tag !== 'Terminal'", replace: 'false' }],
    tests,
  },
  {
    name: 'a stale list is held whole',
    edits: [{ file: whole, find: '    connection.stale ||\n', replace: '' }],
    tests,
  },
  {
    name: 'an exists fixes nothing of the rows it counts',
    edits: [
      {
        file: '../../entity/src/evaluate.ts',
        find: '  const { rows, missing } = anchor.pointing(node.relation, pinned)',
        replace: '  const { rows, missing } = anchor.pointing(node.relation, new Map())',
      },
    ],
    tests,
  },
  {
    name: 'a pending layer decides no exists over the lists held whole',
    edits: [
      {
        file: layers,
        find: '          whole: wholeListsOf(connections, lists.queryOf, context),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an answer decides no exists over the lists held whole',
    edits: [{ file: bodies, find: '        whole,\n', replace: '' }],
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
