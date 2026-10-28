/**
 * `and`, `or` and `not` compiled to SQL, and a field-free operand settled per
 * request, broken in turn: `pnpm mutate packages/remote-drizzle/test/logic.mutations.ts`
 * checks that a test fails for every one.
 */
const compile = '../src/compile.ts'
const evaluate = '../../entity/src/evaluate.ts'
const tests = [
  'packages/remote-drizzle/test/compile.test.ts',
  'packages/remote-drizzle/test/conformance.test.ts',
]

export default [
  {
    name: 'a decisive operand does not decide the whole',
    edits: [
      {
        file: compile,
        find: '  if (parts.includes(decisive)) return constant(decisive)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a settled operand reaches the database as a constant',
    edits: [
      {
        file: compile,
        find: "typeof part === 'boolean' ? [] :",
        replace: "typeof part === 'boolean' ? [constant(part)] :",
      },
    ],
    tests,
  },
  {
    name: 'nothing is settled: every operand is sent to the database',
    edits: [
      {
        file: evaluate,
        find: '      field: read.fields.length + read.next.length + read.reaches.length > 0,\n',
        replace: '      field: true,\n',
      },
    ],
    tests,
  },
  {
    name: 'a decided operand stops the others being compiled',
    edits: [
      {
        file: compile,
        find: '  const parts = operands.map(each =>',
        replace:
          '  const parts = operands.some(each => Option.getOrUndefined(decide(each, input, query)) === decisive)\n    ? [decisive]\n    : operands.map(each =>',
      },
    ],
    tests,
  },
  {
    name: 'a field written second keeps its operator',
    edits: [
      {
        file: compile,
        find: '[node.right, node.left, flipped[node.operator]]',
        replace: '[node.right, node.left, node.operator]',
      },
    ],
    tests,
  },
  {
    name: 'a comparison ignores its collation',
    edits: [
      {
        file: compile,
        find: '  return Option.match(node.collation, {',
        replace: '  return Option.match(Option.none(), {',
      },
    ],
    tests,
  },
  {
    name: 'lt is written as lte',
    edits: [{ file: compile, find: "  lt: '<',\n", replace: "  lt: '<=',\n" }],
    tests,
  },
  {
    name: 'a predicate that reads no field is sent to the database',
    edits: [
      {
        file: compile,
        find: '    onSome: constant,\n    onNone: () => undecided(node, target, input, query),',
        replace:
          '    onSome: () => undecided(node, target, input, query),\n    onNone: () => undecided(node, target, input, query),',
      },
    ],
    tests,
  },
  {
    name: 'a not compiles to its operand',
    edits: [
      {
        file: compile,
        find: '      return negate(predicate(node.operand, target, input, query))',
        replace: '      return predicate(node.operand, target, input, query)',
      },
    ],
    tests,
  },
  {
    name: 'an or compiles as an and',
    edits: [
      {
        file: compile,
        find: "      return connective(node.operands, 'or', target, input, query)",
        replace: "      return connective(node.operands, 'and', target, input, query)",
      },
    ],
    tests,
  },
]
