const tests = ['packages/guard/test/check.test.ts']

const check = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/check.ts', find, replace }],
  tests,
})

export default [
  check(
    'a comparison over an absent key is proved as one over a number',
    '!SchemaAST.isOptional(schema.ast) &&',
    '',
  ),
  check('a comparison over NaN is proved as one over a number', '!Schema.is(schema)(NaN)', 'true'),
  check(
    'a surface without rules is open in a closed set',
    "attachment.unguarded === 'allow'",
    'true',
  ),
  check(
    'a rule over a change is assumed of a stored row',
    '.filter(inv => !Entity.readsBefore(inv))',
    '',
  ),
  check(
    'a surface asks every rule',
    'Expr.any(...surface.rules.map(term))',
    'Expr.all(...surface.rules.map(term))',
  ),
  check('an all asks any rule', 'Expr.all(...rules.map(term))', 'Expr.any(...rules.map(term))'),
  check(
    'an or asks both sides',
    '(terms): Term => Expr.any(...terms)',
    '(terms): Term => Expr.all(...terms)',
  ),
  check(
    'an and asks either side',
    '(terms): Term => Expr.all(...terms)',
    '(terms): Term => Expr.any(...terms)',
  ),
  check(
    'a relation is read as a member without a rule',
    'Object.hasOwn(entity.relations, member)',
    'false',
  ),
  check(
    'a rule that reads another row is one term for every interaction',
    'if (reachesOther(guard)) return unknownRule(guard.name)',
    '',
  ),
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
