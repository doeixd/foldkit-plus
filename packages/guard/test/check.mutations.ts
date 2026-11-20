const tests = ['packages/guard/test/check.test.ts']

export default [
  {
    name: 'a principal guard is assumed to allow both interactions',
    edits: [
      {
        file: '../src/check.ts',
        find: 'unknownRule(`${interaction}.${name}`)',
        replace: 'Expr.lit(true)',
      },
    ],
    tests,
  },
  {
    name: 'an invalid enumerated step is treated as valid',
    edits: [{ file: '../../entity/src/laws.ts', find: 'refused.push(step)', replace: 'void step' }],
    tests,
  },
  {
    name: 'a non-disclosure check drops the member read restriction',
    edits: [
      {
        file: '../src/check.ts',
        find: 'terms.push(slot(surfaces[member]?.Read, true))',
        replace: 'terms.push(Expr.lit(true))',
      },
    ],
    tests,
  },
  {
    name: 'a policy check omits entity invariants',
    edits: [{ file: '../src/check.ts', find: '!Entity.readsBefore(inv)', replace: 'false' }],
    tests,
  },
]
