/**
 * Three-valued judgement and relation paths, broken in turn:
 * `pnpm mutate packages/entity/test/judge.mutations.ts` checks that a test
 * fails for every one.
 */
const evaluate = '../src/evaluate.ts'
const held = '../src/held.ts'
const expr = '../src/expr.ts'
const judge = ['packages/entity/test/judge.test.ts']
const path = ['packages/entity/test/path.test.ts']

export default [
  {
    name: 'a field the holder lacks reads as null',
    edits: [
      {
        file: evaluate,
        find: 'Held.match(row.field(key), { onHeld: value => value, onUnheld: reason => new Unheld(reason) }),',
        replace: 'Held.match(row.field(key), { onHeld: value => value, onUnheld: () => null }),',
      },
    ],
    tests: judge,
  },
  {
    name: "and lets SQL's unknown win over an unheld operand",
    edits: [
      {
        file: evaluate,
        find: [
          '      // operand could still make the whole false.',
          '      const unheld = truths.find(isUnheld)',
          '      if (unheld !== undefined) return unheld',
          "      return truths.includes('unknown') ? 'unknown' : true",
        ].join('\n'),
        replace: [
          '      // operand could still make the whole false.',
          "      if (truths.includes('unknown')) return 'unknown'",
          '      return truths.find(isUnheld) ?? true',
        ].join('\n'),
      },
    ],
    tests: judge,
  },
  {
    name: 'or reads an unheld operand as false',
    edits: [
      {
        file: evaluate,
        find: [
          '      if (truths.includes(true)) return true',
          '      const unheld = truths.find(isUnheld)',
          '      if (unheld !== undefined) return unheld',
        ].join('\n'),
        replace: '      if (truths.includes(true)) return true',
      },
    ],
    tests: judge,
  },
  {
    name: 'not of an unheld operand is decided',
    edits: [
      {
        file: evaluate,
        find: "      return truth === 'unknown' || isUnheld(truth) ? truth : !truth",
        replace: "      return truth === 'unknown' ? truth : !truth",
      },
    ],
    tests: judge,
  },
  {
    name: 'eq asks what is held before a null decides',
    edits: [
      {
        file: evaluate,
        find: [
          "      if (isNull(left) || isNull(right)) return 'unknown'",
          '      if (isUnheld(left)) return left',
          '      if (isUnheld(right)) return right',
          '      if (holdsNul(left) || holdsNul(right)) throw new QueryEvaluateError(nul)',
          '      return left === right',
        ].join('\n'),
        replace: [
          '      if (isUnheld(left)) return left',
          '      if (isUnheld(right)) return right',
          "      if (isNull(left) || isNull(right)) return 'unknown'",
          '      if (holdsNul(left) || holdsNul(right)) throw new QueryEvaluateError(nul)',
          '      return left === right',
        ].join('\n'),
      },
    ],
    tests: judge,
  },
  {
    name: 'an exists is false where pointing rows may be missing',
    edits: [
      {
        file: evaluate,
        find: '  let unheld = Option.map(missing, reason => new Unheld(reason))',
        replace: '  let unheld = Option.none<Unheld>()',
      },
    ],
    tests: judge,
  },
  {
    name: 'an exists through a path that reaches no row is false',
    edits: [
      {
        file: evaluate,
        find: "  if (anchor === null) return 'unknown'",
        replace: '  if (anchor === null) return false',
      },
    ],
    tests: judge,
  },
  {
    name: 'a path that reaches no row is unknown rather than null',
    edits: [
      {
        file: evaluate,
        find: '      return row === null || isUnheld(row) ? row : row.field(node.field.key)',
        replace:
          "      return row === null ? new Unheld('no row') : isUnheld(row) ? row : row.field(node.field.key)",
      },
    ],
    tests: judge,
  },
  {
    name: 'a strict operator beside an unheld argument ignores a null',
    edits: [
      {
        file: evaluate,
        find: "    return call.operator.nulls === 'strict' && values.some(isNull) ? null : unheld",
        replace: '    return unheld',
      },
    ],
    tests: judge,
  },
  {
    name: 'Judge refuses an operator the holder does not run',
    edits: [
      { file: evaluate, find: '          if (scope.judging) {', replace: '          if (false) {' },
    ],
    tests: judge,
  },
  {
    name: "Judge.query keeps a row SQL's null leaves out",
    edits: [
      {
        file: evaluate,
        find: "    if (truths.some(truth => truth === false || truth === 'unknown')) return known(false)",
        replace: '    if (truths.some(truth => truth === false)) return known(false)',
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
        find: '  if (isUnheld(judged)) throw new RowsMissingError(judged.reason)',
        replace: '  if (isUnheld(judged)) return false',
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
          '                reached.complete',
          '                  ? held(Option.none<HeldRow>())',
          '                  : unheld(`${target.name} ${String(link.value)} is not held`),',
        ].join('\n'),
        replace: '                held(Option.none<HeldRow>()),',
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
      { file: expr, find: '    if (owner.token !== target.token) {', replace: '    if (false) {' },
    ],
    tests: path,
  },
  {
    name: 'a path may follow any number of relations',
    edits: [
      {
        file: expr,
        find: '    if (path.via.length > maxPathLength) {',
        replace: '    if (path.via.length > maxPathLength + 1) {',
      },
    ],
    tests: path,
  },
  {
    name: "an exists' filter may reach past its row",
    edits: [
      {
        file: expr,
        find: '    if (foreign !== undefined || read.next.length > 0 || read.reaches.length > 0) {',
        replace: '    if (foreign !== undefined || read.next.length > 0) {',
      },
    ],
    tests: path,
  },
  {
    name: 'a path claims no row of the query it is in',
    edits: [{ file: expr, find: '      yield expr.via[0]', replace: '' }],
    tests: path,
  },
  {
    name: "an exists' filter's inputs are not read",
    edits: [
      {
        file: expr,
        find: '        inner.inputs.forEach(key => found.inputs.add(key))',
        replace: '',
      },
    ],
    tests: path,
  },
  {
    name: 'a list may order by a path',
    edits: [{ file: expr, find: "  if (expr._tag === 'Path') {", replace: '  if (false) {' }],
    tests: path,
  },
]
