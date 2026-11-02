/**
 * A list selecting what a declared insert cannot predict (#342), broken in
 * turn: `pnpm mutate packages/remote/test/unpredicted.mutations.ts`.
 */
const unpredicted = '../src/unpredicted.ts'
const remote = '../src/remote.ts'
const tests = ['packages/remote/test/unpredicted.test.ts']

export default [
  {
    name: 'what its input maps is not predicted',
    edits: [
      { file: unpredicted, find: '    ...write.sets.map(set => set.field.key),\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'what its Entity sets on create is not predicted',
    edits: [
      {
        file: unpredicted,
        find: '    ...write.context.map(set => set.member.key),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a count is not predicted',
    edits: [{ file: unpredicted, find: 'Count: () => [key],', replace: 'Count: () => [],' }],
    tests,
  },
  {
    name: 'an update is judged as an insert',
    edits: [{ file: unpredicted, find: "  if (write._tag !== 'Insert') return []\n", replace: '' }],
    tests,
  },
  {
    name: 'a relation is not judged',
    edits: [
      { file: unpredicted, find: ' ||\n    Object.hasOwn(entity.relations, key)', replace: '' },
    ],
    tests,
  },
  {
    name: 'reported without verifyPredictions',
    edits: [
      {
        file: remote,
        find: '    if (verify.on) reportUnpredicted(query.name, select)',
        replace: '    reportUnpredicted(query.name, select)',
      },
    ],
    tests,
  },
  {
    name: 'reported on every read',
    edits: [
      { file: remote, find: ' || unpredictedReported.has(key)) continue', replace: ') continue' },
    ],
    tests,
  },
  {
    name: 'reported with nothing missing',
    edits: [
      {
        file: remote,
        find: '      if (members.length === 0 || unpredictedReported.has(key)) continue',
        replace: '      if (unpredictedReported.has(key)) continue',
      },
    ],
    tests,
  },
]
