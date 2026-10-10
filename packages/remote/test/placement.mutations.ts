/**
 * Placing a row in a loaded list, broken in turn:
 * `pnpm mutate packages/remote/test/placement.mutations.ts`.
 */
const tests = ['packages/remote/test/placement.test.ts']
const placement = '../src/placement.ts'
const index = '../src/index.ts'

export default [
  {
    name: 'a list that cannot be placed is placed anyway',
    edits: [
      {
        file: placement,
        find: "if (placement._tag === 'NotPlaceable') return RowPlace.Unknown({ reason: placement.reason })",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a row is compared with its own old edge',
    edits: [
      {
        file: placement,
        find: 'const edges = segment.edges.filter(edge => edge.key !== key)',
        replace: 'const edges = segment.edges',
      },
    ],
    tests,
  },
  {
    name: 'a row is placed after the edge it sorts before',
    edits: [{ file: placement, find: 'if (sign.value < 0) {', replace: 'if (sign.value > 0) {' }],
    tests,
  },
  {
    name: 'a row before a segment is placed though rows precede it',
    edits: [
      {
        file: placement,
        find: "Match.tag('Terminal', () => before),",
        replace:
          "Match.tag('Terminal', () => before),\n          Match.tag('Cursor', () => before),",
      },
    ],
    tests,
  },
  {
    name: 'a row past a segment is placed at its end though rows follow',
    edits: [
      {
        file: placement,
        find: "Match.tag('Terminal', () => true),",
        replace: "Match.tag('Terminal', () => true),\n      Match.tag('Cursor', () => true),",
      },
    ],
    tests,
  },
  {
    name: 'a row between two edges is placed before the first one',
    edits: [{ file: placement, find: 'if (position > 0) return before', replace: '' }],
    tests,
  },
  {
    name: 'a list reads only what its view selects, though it is placeable',
    edits: [
      {
        file: index,
        find: "if (Relational.placement(body, encoded)._tag !== 'Placeable') return contract",
        replace: 'return contract',
      },
    ],
    tests,
  },
  {
    name: 'every list reads its body’s fields, placeable or not',
    edits: [
      {
        file: index,
        find: "if (Relational.placement(body, encoded)._tag !== 'Placeable') return contract",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'keys of different kinds are compared anyway',
    edits: [
      {
        file: '../../entity/src/evaluate.ts',
        find: 'checkOrder([left, right], terms, query)',
        replace: 'void terms',
      },
    ],
    tests,
  },
]
