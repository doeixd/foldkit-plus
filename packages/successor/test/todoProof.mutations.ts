const check = ['packages/successor/test/todoProof.test.ts']
const browser = ['packages/successor/test/todoSurface.browser.test.ts']

export default [
  {
    name: 'the composed proof skips the publication invariant',
    edits: [
      { file: 'fixtures/todoProof.ts', find: 'if (!invariant(after))', replace: 'if (false)' },
    ],
    tests: check,
  },
  {
    name: 'an undecided or refuted count still uses its delta',
    edits: [
      {
        file: 'fixtures/todoProof.ts',
        find: "Verdict.isTrue(report.verdict) && bounded(before, key) ? 'incremental' : 'recompute'",
        replace: "'incremental'",
      },
    ],
    tests: check,
  },
  {
    name: 'any input path counts as covered at resume',
    edits: [
      {
        file: '../src/surface.ts',
        find: 'provided.some(held => covers(held, path))',
        replace: 'true',
      },
    ],
    tests: check,
  },
  {
    name: 'every visible binding evaluates on any commit',
    edits: [
      {
        file: '../src/surface.ts',
        find: 'for (const id of graph.readersOf(modelPath(affected))) dirty.add(id)',
        replace: 'for (const id of bindings.keys()) dirty.add(id)',
      },
    ],
    tests: browser,
  },
  {
    name: 'equal values still patch their targets',
    edits: [
      {
        file: '../src/surface.ts',
        find: 'if (Object.is(value, current)) return false',
        replace: 'if (false) return false',
      },
    ],
    tests: browser,
  },
]
