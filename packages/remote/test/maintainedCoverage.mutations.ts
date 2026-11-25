const tests = ['packages/remote/test/maintainedCoverage.test.ts']

export default [
  {
    name: 'covers skips entity name check',
    edits: [
      {
        file: '../src/maintained/coverage.ts',
        find: '  if (held.entity.name !== asked.entity.name) {\n    return Verdict.False()\n  }',
        replace:
          '  if (false && held.entity.name !== asked.entity.name) {\n    return Verdict.False()\n  }',
      },
    ],
    tests,
  },
  {
    name: 'classify claims min is invertible on delete',
    edits: [
      {
        file: '../src/maintained/classify.ts',
        find: "    Min: () =>\n      on === 'insert'\n        ? Classification.Update({ by: 'fold-insert-only' })\n        : Classification.Rescan({ reason: 'fold-not-invertible-on-delete' }),",
        replace: "    Min: () => Classification.Update({ by: 'fold-invertible' }),",
      },
    ],
    tests,
  },
  {
    name: 'restoreAsOf marks restored offline value as not needing refresh',
    edits: [
      {
        file: '../src/maintained/asOf.ts',
        find: '  needsRefresh: true,',
        replace: '  needsRefresh: false,',
      },
    ],
    tests,
  },
]
