/**
 * Laws, evidence and the conformance helper, broken in turn:
 * `pnpm mutate packages/entity/test/law.mutations.ts`.
 */
const tests = ['packages/entity/test/law.test.ts']
const expr = '../src/expr.ts'
const law = '../src/law.ts'
const operators = '../src/operators.ts'
const helper = '../src/conformance/operator.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // ---- declaring
  edit('a law of two arguments fits any operator', expr, '    input.length === 2', '    true'),
  edit(
    'a witness is never checked',
    expr,
    '    Schema.is(Schema.toEncoded(schema))(value)',
    '    true',
  ),
  edit(
    'a left witness is never checked',
    expr,
    "side === 'right' ? Option.none() : decodes(value, input[0]!, 'left witness'),",
    "true ? Option.none() : decodes(value, input[0]!, 'left witness'),",
  ),
  edit('an inverse of any arity', expr, 'other.descriptor.input.length === 1', 'true'),
  edit('distributing over any arity', expr, 'over.descriptor.input.length === 2', 'true'),
  edit(
    'a monotonic position past the arguments',
    expr,
    'position >= 0 && position < input.length',
    'position >= 0',
  ),
  edit('a collation law of any operator', expr, "      collation === 'operands'", '      true'),
  edit(
    'a domain is not described',
    law,
    'onSome: domain => Schema.toJsonSchemaDocument(domain).schema,',
    'onSome: () => null,',
  ),
  edit(
    'a law is never narrowed',
    law,
    'Object.freeze({ ...law, domain: Option.some(domain) })',
    'law',
  ),

  // ---- evidence
  edit(
    'evidence of an operator the table lacks is kept',
    operators,
    'fail(`evidence names ${record.operator}, which this table does not implement`)',
    '[]',
  ),
  edit(
    'evidence of an undeclared law is kept',
    operators,
    'if (!laws.some(law => sameLaw(law, record.law))) {',
    'if (false) {',
  ),
  edit(
    'a replaced implementation keeps its evidence',
    operators,
    'base.evidence.filter(({ operator }) => !names.has(operator)),',
    'base.evidence,',
  ),
  edit('a merge drops evidence', operators, '[...left.evidence, ...right.evidence],', '[],'),
  edit(
    'every operator is described with every record',
    operators,
    'evidence: base.evidence.filter(record => record.operator === nameOf(operator)),',
    'evidence: base.evidence,',
  ),

  // ---- the equations
  edit(
    'associativity compares a side with itself',
    helper,
    'run(call(call(a, b), c)), run(call(a, call(b, c)))',
    'run(call(call(a, b), c)), run(call(call(a, b), c))',
  ),
  edit('commutativity compares a side with itself', helper, 'run(call(b, a))', 'run(call(a, b))'),
  edit(
    'idempotence asks for the call itself',
    helper,
    'run(call(a, a)), value(a))',
    'run(call(a, a)), run(call(a, a)))',
  ),
  edit(
    'an identity answers itself',
    helper,
    'sided(witness, side, a => a)',
    'sided(witness, side, () => witness)',
  ),
  edit(
    'an absorbing value answers the other',
    helper,
    'sided(witness, side, () => witness)',
    'sided(witness, side, a => a)',
  ),
  edit(
    'an inverse answers the operator itself',
    helper,
    'run(call(a, other(a))), value(identity))',
    'run(call(a, other(a))), run(call(a, other(a))))',
  ),
  edit(
    'distributing compares a side with itself',
    helper,
    'run(over(call(a, b), call(a, c)))',
    'run(call(a, over(b, c)))',
  ),
  edit(
    'monotonic ignores its direction',
    helper,
    'sign * order(left.value, right.value) <= 0',
    'true',
  ),
  edit(
    'collation is not folded away',
    helper,
    'Value: ({ value }) => Outcome.Value({ value: foldText(value) }),',
    'Value: ({ value }) => Outcome.Value({ value }),',
  ),
  edit(
    'every two values are alike',
    helper,
    ': JSON.stringify(left.value) === JSON.stringify(right.value)',
    ': true',
  ),
  edit('a failed law is not reported', helper, 'if (!plan.holds(left, right)) {', 'if (false) {'),

  // ---- choosing and running cases
  edit(
    'every case runs, however many',
    helper,
    'if (tuples.length <= limit) return tuples',
    'return tuples',
  ),
  edit('the seed chooses nothing', helper, 'const next = random(seed)', 'const next = random(0)'),
  edit(
    'a defined operator runs without its expansion',
    helper,
    'if (Option.isSome(descriptor.definedAs)) {',
    'if (false) {',
  ),
  edit(
    'text is run under binary alone',
    helper,
    ': [Option.some(Collation.binary), Option.some(Collation.asciiFold)]',
    ': [Option.some(Collation.binary)]',
  ),
  edit(
    'null is never generated',
    helper,
    'const nulls = decodes(schema)(null) ? [null] : []',
    'const nulls: Array<null> = []',
  ),
  edit(
    'null is generated for any schema',
    helper,
    'const nulls = decodes(schema)(null) ? [null] : []',
    'const nulls = [null]',
  ),
  edit('text holding NUL is never generated', helper, '...(text ? [`a${NUL}`] : [])', '...[]'),
  edit(
    'a disagreement is never reported',
    helper,
    'others.some(each => !same(first, each))',
    'false',
  ),

  // ---- NUL before null
  {
    name: 'a null beside NUL answers first',
    edits: [
      {
        file: '../src/evaluate.ts',
        find: '  if (values.some(holdsNul)) {',
        replace:
          "  if (operator.nulls === 'strict' && values.some(isNull)) return null\n  if (values.some(holdsNul)) {",
      },
    ],
    tests,
  },
]
