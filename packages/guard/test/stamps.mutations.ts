/**
 * Fields the server sets on a create, broken in turn:
 * `pnpm mutate packages/guard/test/stamps.mutations.ts`.
 */
const tests = ['packages/guard/test/stamps.test.ts']
const guard = '../src/server.ts'
const drizzle = '../../remote-drizzle/src/index.ts'
const server = '../../remote-server/src/index.ts'

export default [
  {
    name: 'a retried insert compares its stamp too',
    edits: [{ file: drizzle, find: '.filter(([key]) => !stamped.includes(key))', replace: '' }],
    tests,
  },
  {
    name: 'a retried insert compares none of its values',
    edits: [
      {
        file: drizzle,
        find: '.filter(([key]) => !stamped.includes(key))',
        replace: '.filter(() => false)',
      },
    ],
    tests,
  },
  {
    name: 'the guard passes no stamps on',
    edits: [
      {
        file: guard,
        find: 'stamped: [...given.stamped, ...stamps.map(({ field }) => field)],',
        replace: 'stamped: given.stamped,',
      },
    ],
    tests,
  },
  {
    name: 'registration does not count what a writer sets',
    edits: [{ file: server, find: ', ...(writer.sets ?? [])])', replace: '])' }],
    tests,
  },
  {
    name: 'the guard does not report its stamps as set',
    edits: [
      {
        file: guard,
        find: `        ...presets.map(({ field }) => field),
        ...stamps.map(({ field }) => field),`,
        replace: '        ...presets.map(({ field }) => field),',
      },
    ],
    tests,
  },
  {
    name: 'an input may set a stamp',
    edits: [
      {
        file: guard,
        find: 'const set = [...presets, ...stamps].find(',
        replace: 'const set = presets.find(',
      },
    ],
    tests,
  },
  {
    name: 'a field may be both preset and stamped',
    edits: [
      {
        file: guard,
        find: 'if (presets.some(preset => preset.field === field)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
]
