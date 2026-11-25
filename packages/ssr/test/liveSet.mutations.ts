const tests = ['packages/ssr/test/liveSet.test.ts']

export default [
  {
    name: 'liveSet skips closing over GraphEdge.Sends',
    edits: [
      {
        file: '../src/liveSet.ts',
        find: 'for (const next of sends.get(tag) ?? []) messages.add(next)',
        replace: 'for (const next of sends.get(tag) ?? []) void next',
      },
    ],
    tests,
  },
  {
    name: 'liveSet treats an undeclared live Message as empty instead of unbounded',
    edits: [
      {
        file: '../src/liveSet.ts',
        find: 'if (!foundWriter) {\n      unbounded = true\n    }',
        replace: 'if (!foundWriter) {\n      unbounded = false\n    }',
      },
    ],
    tests,
  },
]
