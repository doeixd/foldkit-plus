const tests = ['packages/remote/test/maintainedIndexes.test.ts']

export default [
  {
    name: 'maybeOrderIndex builds index even at or below threshold',
    edits: [
      {
        file: '../src/maintained/indexes.ts',
        find: '  entries.length > threshold ? Option.some(makeOrderIndex(entries, compare)) : Option.none()',
        replace:
          '  entries.length >= threshold ? Option.some(makeOrderIndex(entries, compare)) : Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'dependentQuery skips readiness check and sends unbound query',
    edits: [
      {
        file: '../src/dependent.ts',
        find: '      if (!state.ready) return Option.none()',
        replace: '      if (false && !state.ready) return Option.none()',
      },
    ],
    tests,
  },
]
