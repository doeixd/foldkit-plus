/**
 * Descriptions and version refusals, broken in turn:
 * `pnpm mutate packages/entity/test/describe.mutations.ts`.
 */
const tests = ['packages/entity/test/describe.test.ts']
const expr = '../src/expr.ts'
const operators = '../src/operators.ts'
const evaluate = '../src/evaluate.ts'
const edit = (name: string, file: string, find: string, replace: string, only = tests) => ({
  name,
  edits: [{ file, find, replace }],
  tests: only,
})

export default [
  // ---- a version refused by name
  edit('the versions held are never named', expr, '  return held.length === 0', '  return true'),
  edit(
    'a memory table holds no version of anything',
    operators,
    '.filter(({ operator }) => operator.id === id)',
    '.filter(() => false)',
  ),
  edit(
    'a run names the missing operator alone',
    evaluate,
    'throw new OperatorMissingError(call.operator, scope.operators)',
    'throw new OperatorMissingError(call.operator)',
  ),
  edit(
    'an operator over stored values names the missing operator alone',
    evaluate,
    'throw new OperatorMissingError(operator, options.operators)',
    'throw new OperatorMissingError(operator)',
  ),
  edit(
    'a SQL table holds no version of anything',
    '../../remote-drizzle/src/operators.ts',
    '.filter(({ operator }) => operator.id === id)',
    '.filter(() => false)',
    ['packages/remote-drizzle/test/operators.test.ts'],
  ),

  // ---- a description
  edit(
    'a description names no version',
    operators,
    '  name: nameOf(operator),',
    '  name: operator.id,',
  ),
  edit(
    'a description drops its words',
    operators,
    'description: Option.getOrNull(operator.description),',
    'description: null,',
  ),
  edit(
    'a description drops its inputs',
    operators,
    'input: operator.input.map(jsonSchemaOf),',
    'input: [],',
  ),
  edit(
    'a description drops its output',
    operators,
    'output: jsonSchemaOf(operator.output),',
    'output: {},',
  ),
  edit(
    'a description drops its laws',
    operators,
    'laws: operator.laws.map(Law.describe),',
    'laws: [],',
  ),
  edit(
    'a defined operator is described as primitive',
    operators,
    'defined: Option.isSome(operator.definedAs),',
    'defined: false,',
  ),
  edit(
    'what a schema refers to is dropped',
    operators,
    ': { ...document.schema, $defs: document.definitions }',
    ': document.schema',
  ),
]
