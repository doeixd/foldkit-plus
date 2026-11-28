const tests = ['packages/metakit/test/t5-derived-foreign.test.ts']

export default [
  {
    name: 'the dispatcher does not pass the evaluating table',
    edits: [
      {
        file: '../src/ops/eval.ts',
        find: 'result = implementation.run(values, implementations)',
        replace: 'result = implementation.run(values)',
      },
    ],
    tests,
  },
  {
    name: 'a derived body prefers its definition-time table',
    edits: [
      {
        file: '../src/operation.ts',
        find: '{ ...spec.foreign, ...foreign }',
        replace: '{ ...foreign, ...spec.foreign }',
      },
    ],
    tests,
  },
  {
    name: 'a derived body ignores its definition-time table',
    edits: [
      {
        file: '../src/operation.ts',
        find: '{ ...spec.foreign, ...foreign }',
        replace: '{ ...foreign }',
      },
    ],
    tests,
  },
]
