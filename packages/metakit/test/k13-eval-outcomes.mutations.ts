const tests = ['packages/metakit/test/k13-eval-outcomes.test.ts']

export default [
  {
    name: 'unmatched subjects are passed directly to JSON.stringify',
    edits: [
      {
        file: '../src/ops/eval.ts',
        find: 'detail: `no case names ${formatValue(target)}`',
        replace: 'detail: `no case names ${JSON.stringify(target)}`',
      },
    ],
    tests,
  },
  {
    name: 'the formatting fallback can throw',
    edits: [
      {
        file: '../src/ops/format.ts',
        find: `  try {
    return String(value) || '<unprintable value>'
  } catch {
    return '<unprintable value>'
  }`,
        replace: `  return String(value) || '<unprintable value>'`,
      },
    ],
    tests,
  },
  {
    name: 'the match NUL screen traverses cyclic lists recursively',
    edits: [
      {
        file: '../src/ops/eval.ts',
        find: 'if (matchHoldsNul(target))',
        replace: 'if (Node.holdsNul([target]))',
      },
    ],
    tests,
  },
  {
    name: 'the call builder accepts the wrong arity',
    edits: [
      {
        file: '../src/build.ts',
        find: 'if (args.length !== expected)',
        replace: 'if (false)',
      },
    ],
    tests,
  },
]
