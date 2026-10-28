/**
 * Judging rows one at a time, broken in turn:
 * `pnpm mutate packages/entity/test/evaluateEach.mutations.ts`.
 */
export default [
  {
    name: 'judging ignores the table it is given',
    edits: [
      {
        file: '../src/evaluate.ts',
        find: `const operators = options.operators ?? Operators.kernel
  const { context } = options
  assertSupported(body, operators)
  const terms`,
        replace: `const operators = Operators.kernel
  const { context } = options
  assertSupported(body, operators)
  const terms`,
      },
    ],
    tests: ['packages/entity/test/evaluateEach.test.ts'],
  },
  {
    name: 'a refused row refuses the run',
    edits: [
      {
        file: '../src/evaluate.ts',
        find: '!(error instanceof QueryEvaluateError) ||',
        replace: 'true ||',
      },
    ],
    tests: ['packages/entity/test/evaluateEach.test.ts'],
  },
  {
    name: 'an input holding a NUL is set aside per row',
    edits: [
      {
        file: '../src/evaluate.ts',
        find: '        givenUnportable(body, terms, input)\n',
        replace: '        false\n',
      },
    ],
    tests: ['packages/entity/test/evaluateEach.test.ts'],
  },
  {
    name: 'an input the body does not read is checked too',
    edits: [
      {
        file: '../src/evaluate.ts',
        find: 'Query.dependencies(body).inputs.some(key => {',
        replace: 'Object.keys(input).some(key => {',
      },
    ],
    tests: ['packages/entity/test/evaluateEach.test.ts'],
  },
  {
    name: 'a refused order key is still kept',
    edits: [
      {
        file: '../src/evaluate.ts',
        find: 'keyed.push({ row, keys: keysOf(row, terms, scope) })',
        replace: 'keyed.push({ row, keys: [] })',
      },
    ],
    tests: ['packages/entity/test/evaluateEach.test.ts'],
  },
  {
    name: 'order kinds across rows go unchecked',
    edits: [
      {
        file: '../src/evaluate.ts',
        find: `    terms,
    body.entity.name,
  )
  return {`,
        replace: `    [],
    body.entity.name,
  )
  return {`,
      },
    ],
    tests: ['packages/entity/test/evaluateEach.test.ts'],
  },
  {
    name: 'matched rows are left unordered',
    edits: [
      {
        file: '../src/evaluate.ts',
        find: `matched: keyed
      .sort((left, right) => byTerms(terms, left.keys, right.keys))`,
        replace: 'matched: keyed',
      },
    ],
    tests: ['packages/entity/test/evaluateEach.test.ts'],
  },
]
