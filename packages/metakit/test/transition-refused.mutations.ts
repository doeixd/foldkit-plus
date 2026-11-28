const tests = ['packages/metakit/test/transition-refused.test.ts']
const file = '../src/transition.ts'

export default [
  {
    name: 'swaps the input and supplied refusal variants',
    edits: [
      {
        file,
        find: 'return Result.fail(new Refused({ why: Why.Input() }))\n  }\n  if (',
        replace: 'return Result.fail(new Refused({ why: Why.Supplied() }))\n  }\n  if (',
      },
      {
        file,
        find: 'return Result.fail(new Refused({ why: Why.Supplied() }))\n  }\n  const answer',
        replace: 'return Result.fail(new Refused({ why: Why.Input() }))\n  }\n  const answer',
      },
    ],
    tests,
  },
  {
    name: 'reports a refusing guard as a false guard',
    edits: [
      {
        file,
        find: 'return Result.fail(new Refused({ why: Why.GuardRefused({ refusal }) }))',
        replace: 'return Result.fail(new Refused({ why: Why.Guard({ answer: false }) }))',
      },
    ],
    tests,
  },
  {
    name: 'returns the last evaluation refusal',
    edits: [
      {
        file,
        find: 'const refusal = refusals[0]',
        replace: 'const refusal = refusals.at(-1)',
      },
    ],
    tests,
  },
  {
    name: 'reports a null guard as a false guard',
    edits: [
      {
        file,
        find: 'Why.Guard({ answer: answer ?? null })',
        replace: 'Why.Guard({ answer: answer ?? false })',
      },
    ],
    tests,
  },
  {
    name: 'wraps a nested child refusal as an evaluation refusal',
    edits: [
      {
        file,
        find: '    if (refusal.cause instanceof Refused) return Result.fail(refusal.cause)\n',
        replace: '',
      },
    ],
    tests,
  },
]
