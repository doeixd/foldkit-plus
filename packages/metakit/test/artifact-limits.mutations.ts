const tests = ['packages/metakit/test/artifact-limits.test.ts']

export default [
  {
    name: 'encoding does not count literal values as nodes',
    edits: [
      {
        file: '../src/artifact.ts',
        find: `          Lit: ({ value }) =>
            copyLiteral(value, depth, budget).pipe(`,
        replace: `          Lit: ({ value }) =>
            copyLiteral(value, depth, {
              ...budget,
              node: level => checkLimit('depth', resolveLimits(options?.limits).maxDepth, level),
            }).pipe(`,
      },
    ],
    tests,
  },
  {
    name: 'decoding ignores the string limit',
    edits: [
      {
        file: '../src/artifact.ts',
        find: 'const budget = makeBudget(resolveLimits(options.limits))',
        replace:
          'const budget = makeBudget({ ...resolveLimits(options.limits), maxStringLength: Infinity })',
      },
    ],
    tests,
  },
  {
    name: 'encoding accepts calls with the wrong arity',
    edits: [
      {
        file: '../src/artifact.ts',
        find: 'yield* checkArity(op, args.length)',
        replace: '',
      },
    ],
    tests,
  },
]
