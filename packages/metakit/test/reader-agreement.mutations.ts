const tests = ['packages/metakit/test/reader-agreement.test.ts']

export default [
  {
    name: 'residual multiplication treats zero as the identity',
    edits: [
      {
        file: '../src/ops/laws.ts',
        find: "  'num.mul': { identity: { value: 1, side: 'both' } },",
        replace: "  'num.mul': { identity: { value: 0, side: 'both' } },",
      },
    ],
    tests,
  },
  {
    name: 'reference ord.lt compares its arguments in reverse',
    edits: [
      {
        file: '../src/ops/eval.ts',
        find: '      return Node.isForeign(op) ? applyForeign(op, values, foreign) : Node.apply(op, values)',
        // The operator is shared. Reverse the comparison only at the reference call site.
        replace: `      if (Node.isForeign(op)) return applyForeign(op, values, foreign)
      const answer = Node.apply(op, values)
      return op.id === 'ord.lt' && typeof answer === 'boolean'
        ? Node.apply(op, [values[1], values[0]])
        : answer`,
      },
    ],
    tests,
  },
  {
    name: 'prepared If drops a refusal from its condition',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: '          if (c === null || Node.isRefusal(c)) return c',
        replace: '          if (c === null) return c',
      },
    ],
    tests,
  },
  {
    name: 'prepared Match skips the NUL screen',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: `          if (Array.isArray(target) || (typeof target === 'string' && target.includes('\\u0000'))) {
            const taken = matchArm(match, target)
            if ('value' in taken) return taken.value
          }
`,
        replace: '',
      },
    ],
    tests,
  },
]
