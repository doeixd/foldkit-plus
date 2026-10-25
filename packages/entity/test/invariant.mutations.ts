/**
 * Invariants, each check broken in turn:
 * `pnpm mutate packages/entity/test/invariant.mutations.ts` checks that a test
 * fails for every one.
 */
const file = '../src/invariant.ts'
const tests = ['packages/entity/test/invariant.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a null passes',
    'truthOver(held.predicate, row) !== true',
    'truthOver(held.predicate, row) === false',
  ),
  edit('a missing field is judged', 'if (absent.length > 0) absent', 'if (false) absent'),
  edit(
    'undecided reads as valid',
    "if (missing.size > 0) return { _tag: 'Undecided'",
    "if (false) return { _tag: 'Undecided'",
  ),
  edit(
    'an id may be declared twice',
    'if (invariantsOf(entity).some(held => held.id === id))',
    'if (false)',
  ),
  edit('an invariant may read an input', 'if (dependencies.inputs.length > 0) {', 'if (false) {'),
  edit('a path may name no field', 'if (!Object.hasOwn(entity.fields, key))', 'if (false)'),
  edit(
    'the path defaults to nothing',
    'const path = options.path ?? reads',
    'const path = options.path ?? []',
  ),
  edit(
    'the same invariant is held twice',
    'merge: values => [...new Set(values)],',
    'merge: values => values,',
  ),
  edit('a decoded value is judged unencoded', ')(decoded[key])', ')(decoded[key]) && decoded[key]'),
  edit(
    'a failure is reported nowhere',
    'path: [key], issue: failure.message',
    "path: [key], issue: 'invalid'",
  ),
  ...[
    ['Eq', 'left: substitutedSide(predicate.left, values),', 'left: predicate.left,'],
    [
      'Null',
      'operand: substitutedOperand(predicate.operand, values) })',
      'operand: predicate.operand })',
    ],
    ['Contains', 'value: substitutedOperand(predicate.value, values),', 'value: predicate.value,'],
    [
      'In',
      'return node({ ...predicate, value: substitutedOperand(predicate.value, values) })',
      'return predicate',
    ],
    [
      'And and Or',
      'operands: Arr.map(predicate.operands, operand => substituted(operand, values)),',
      'operands: predicate.operands,',
    ],
    ['Not', 'operand: substituted(predicate.operand, values) })', 'operand: predicate.operand })'],
    [
      'Compare',
      'left: substitutedOperand(predicate.left, values),\n        right:',
      'left: predicate.left,\n        right:',
    ],
    [
      'a field not given',
      'Object.hasOwn(values, field.key) ? literal(values[field.key]) : field',
      'literal(values[field.key])',
    ],
  ].map(([what, find, replace]) => ({
    name: `${what} is not substituted`,
    edits: [{ file: '../src/expr.ts', find: find!, replace: replace! }],
    tests: ['packages/entity/test/invariant.test.ts'],
  })),
]
