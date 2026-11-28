/**
 * Three-valued judgement and relation paths, broken in turn:
 * `pnpm mutate packages/entity/test/judge.mutations.ts` checks that a test
 * fails for every one.
 */
const evaluate = '../src/evaluate.ts'
const judgeRun = '../src/judgeRun.ts'
const lowerEnv = '../src/environment.ts'
const held = '../src/held.ts'
const relation = '../src/expr/relation.ts'
const dependencies = '../src/expr/dependencies.ts'
const order = '../src/expr/order.ts'
const judge = ['packages/entity/test/judge.test.ts']
const path = ['packages/entity/test/path.test.ts']

export default [
  {
    name: 'a field the holder lacks reads as null',
    edits: [
      {
        file: lowerEnv,
        find: ['        Held.match(row.field(segment), {', '          onUnheld: left(here),'].join(
          '\n',
        ),
        replace: [
          '        Held.match(row.field(segment), {',
          '          onUnheld: () => put(record, segment, null),',
        ].join('\n'),
      },
    ],
    tests: judge,
  },
  {
    name: 'an exists is false where pointing rows may be missing',
    edits: [{ file: lowerEnv, find: 'whole: Option.isNone(missing),', replace: 'whole: true,' }],
    tests: judge,
  },
  {
    name: 'a path that reaches no row is unknown rather than null',
    edits: [
      {
        file: lowerEnv,
        find: [
          '                onNone: () => null,',
          '                onSome: reached => fill(',
        ].join('\n'),
        replace: [
          '                onNone: () => undefined,',
          '                onSome: reached => fill(',
        ].join('\n'),
      },
    ],
    tests: judge,
  },
  {
    name: 'Judge refuses an operator the holder does not run',
    edits: [{ file: judgeRun, find: '  if (!over.judging) {', replace: '  if (true) {' }],
    tests: judge,
  },
  {
    name: "Judge.query keeps a row SQL's null leaves out",
    edits: [
      {
        file: evaluate,
        find: '    if (verdicts.some(Verdict.isFalse)) return Verdict.False()',
        replace:
          '    if (verdicts.some(each => Verdict.isFalse(each) && Option.isNone(each.witness))) return Verdict.False()',
      },
    ],
    tests: judge,
  },
  {
    name: "Judge.predicate answers SQL's null as a plain false",
    edits: [
      {
        file: evaluate,
        find: "if (truth === 'unknown') return Verdict.False(Option.some('null' as const))",
        replace: "if (truth === 'unknown') return Verdict.False<'null'>()",
      },
    ],
    tests: judge,
  },
  {
    name: 'Judge.query ignores a filter only the server runs',
    edits: [
      {
        file: evaluate,
        find: '    return options.serverOnly === undefined',
        replace: '    return true',
      },
    ],
    tests: judge,
  },
  {
    name: 'a run over one row reads another row as false',
    edits: [
      {
        file: evaluate,
        find: [
          '    onUnheld: reason => {',
          '      throw new RowsMissingError(reason)',
          '    },',
          '  })',
          '',
          '/** One operand',
        ].join('\n'),
        replace: ['    onUnheld: () => false,', '  })', '', '/** One operand'].join('\n'),
      },
    ],
    tests: judge,
  },
  {
    name: "a held table's missing row is known absent though the table is partial",
    edits: [
      {
        file: held,
        find: [
          '            reached.complete',
          '              ? held(Option.none<HeldRow>())',
          '              : unheld(`${target.name} ${String(id)} is not held`),',
        ].join('\n'),
        replace: '            held(Option.none<HeldRow>()),',
      },
    ],
    tests: judge,
  },
  {
    name: 'a partial table is taken to hold every pointing row',
    edits: [
      {
        file: held,
        find: [
          '            let missing = from.complete',
          '              ? Option.none<string>()',
          '              : Option.some(`not every ${relation.owner.name} is held`)',
        ].join('\n'),
        replace: '            let missing = Option.none<string>()',
      },
    ],
    tests: judge,
  },
  {
    name: "a path's end is not checked to be on the row reached",
    edits: [
      {
        file: relation,
        find: '    if (owner.token !== target.token) {',
        replace: '    if (false) {',
      },
    ],
    tests: path,
  },
  {
    name: 'a path may follow any number of relations',
    edits: [
      {
        file: relation,
        find: '    if (via.length > maxPathLength) {',
        replace: '    if (via.length > maxPathLength + 1) {',
      },
    ],
    tests: path,
  },
  {
    name: "an exists' filter may reach past its row",
    edits: [
      {
        file: relation,
        find: '    if (foreign !== undefined || read.next.length > 0 || read.reaches.length > 0) {',
        replace: '    if (foreign !== undefined || read.next.length > 0) {',
      },
    ],
    tests: path,
  },
  {
    name: 'a path claims no row of the query it is in',
    edits: [
      {
        file: dependencies,
        find: "          yield origin.via[0]\n          return\n        // It starts at the viewer's row",
        replace: "          return\n        // It starts at the viewer's row",
      },
    ],
    tests: path,
  },
  {
    name: "an exists' filter's inputs are not read",
    edits: [
      {
        file: dependencies,
        find: '          inner.inputs.forEach(key => found.inputs.add(key))',
        replace: '',
      },
    ],
    tests: path,
  },
  {
    name: 'a list may order by a path',
    edits: [
      {
        file: order,
        find: "        Hop: () => Option.some('a path'),",
        replace: '        Hop: () => Option.none<string>(),',
      },
    ],
    tests: path,
  },
]
