const tests = ['packages/metakit/test/nan-nul-screen.test.ts']

export default [
  {
    name: 'nullSafe screens only NUL and not NaN',
    edits: [
      {
        file: '../src/ops/eq.ts',
        find: 'args.find(Node.isRefusal) ?? Node.refusedForEquality(id, args) ?? decide(args[0], args[1])',
        replace:
          'args.find(Node.isRefusal) ?? (Node.holdsNul(args) ? Node.unportable(id) : decide(args[0], args[1]))',
      },
    ],
    tests,
  },
  {
    name: 'eq.in drops the equality refusal screen',
    edits: [
      {
        file: '../src/ops/eq.ts',
        find: "    const screened = Node.refusedForEquality('eq.in', [needle, haystack])\n    if (screened !== undefined) return screened\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'matchArm drops the NUL subject screen',
    edits: [
      {
        file: '../src/ops/eval.ts',
        find: "  if (Node.holdsNul([target])) return { value: Node.unportable('match') }\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'checkCases drops the NUL case label check',
    edits: [
      {
        file: '../src/expr.ts',
        find: '  checkNoNulLabels(name, keys)\n  const literals = literalsOf(on)',
        replace: '  const literals = literalsOf(on)',
      },
    ],
    tests,
  },
  {
    name: 'OrderedEnum.make drops the NUL value check',
    edits: [
      {
        file: '../src/domain/orderedEnum.ts',
        find: `    if (v.includes('\\u0000')) {
      throw new Error(
        \`[metakit] OrderedEnum.make: value \${JSON.stringify(v)} holds a NUL character, which Postgres cannot store\`,
      )
    }\n`,
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'holdsNoNulText accepts any Schema.Number as portable for reflexive equality',
    edits: [
      {
        file: '../src/ops/kind.ts',
        find: '      isFiniteNumber(member) ||\n      SchemaAST.isBoolean(member) ||\n      SchemaAST.isObjects(member) ||',
        replace:
          '      SchemaAST.isNumber(member) ||\n      SchemaAST.isBoolean(member) ||\n      SchemaAST.isObjects(member) ||',
      },
    ],
    tests,
  },
  {
    name: 'Abstract resolveMatchArm drops the NUL subject screen',
    edits: [
      {
        file: '../src/abstract/matches.ts',
        find: '  if (Node.holdsNul([value])) return Option.none()\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Prove lower Match drops the NUL subject refusal',
    edits: [
      {
        file: '../src/prove/lower.ts',
        find: '        const nul = z3.And(z3.Not(target.refused), z3.Not(target.isNull), nulOf(on))',
        replace: '        const nul = never',
      },
    ],
    tests,
  },
]
