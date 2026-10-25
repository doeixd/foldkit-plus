/**
 * Invariants and the Next node they read the row after through, each step
 * broken in turn: `pnpm mutate packages/entity/test/invariant.mutations.ts`
 * checks that a test fails for every one.
 */
const file = '../src/invariant.ts'
const tests = [
  'packages/entity/test/invariant.test.ts',
  'packages/entity/test/transition.test.ts',
  'packages/remote-drizzle/test/transition.test.ts',
]
const edit = (name: string, find: string, replace: string, at = file) => ({
  name,
  edits: [{ file: at, find, replace }],
  tests,
})

export default [
  edit(
    'a null passes',
    'truthOver(held.predicate, before ?? {}, {}, after) !== true',
    'truthOver(held.predicate, before ?? {}, {}, after) === false',
  ),
  edit(
    'the row after is read as the row before',
    'truthOver(held.predicate, before ?? {}, {}, after) !== true',
    'truthOver(held.predicate, before ?? {}, {}, before ?? {}) !== true',
  ),
  edit('a missing field is judged', 'if (absent.length > 0) absent', 'if (false) absent'),
  edit(
    'undecided reads as valid',
    "if (missing.size > 0) return { _tag: 'Undecided'",
    "if (false) return { _tag: 'Undecided'",
  ),
  edit(
    'a create judges a transition invariant',
    'if (readsBefore(held) && before === undefined) continue',
    '',
  ),
  edit(
    'an id may be declared twice',
    'if (invariantsOf(entity).some(held => held.id === id))',
    'if (false)',
  ),
  edit('an invariant may read an input', 'if (dependencies.inputs.length > 0) {', 'if (false) {'),
  edit(
    'a path may name no field',
    'if (!Object.hasOwn(fields, key)) fail(entity,',
    'if (false) fail(entity,',
  ),
  edit(
    'the path defaults to nothing',
    'options.path ?? [...new Set([...afterReads, ...before])]',
    'options.path ?? []',
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
  edit(
    'a value the write sets is not read after',
    'Object.hasOwn(values, field.key) ? literal(values[field.key]) : operand',
    'operand',
    '../src/expr.ts',
  ),
  edit(
    'the evaluator reads the row after as the row',
    'return scope.next[node.field.key]',
    'return scope.row[node.field.key]',
    '../src/evaluate.ts',
  ),
  edit(
    'a predicate reading only the row after is decided from the input',
    'reads = read.fields.length + read.next.length > 0',
    'reads = read.fields.length > 0',
    '../src/evaluate.ts',
  ),
  edit(
    'the compiler reads the row after as the row before',
    'Object.hasOwn(target.next ?? {}, node.field.key)',
    'false',
    '../../remote-drizzle/src/compile.ts',
  ),
  edit('a field after is no dependency', 'found.nextOrder.push(read)', '', '../src/expr.ts'),
  ...[
    ['Eq', 'left: substitutedSide(predicate.left, rewrite),', 'left: predicate.left,'],
    ['Null', 'operand: rewrite(predicate.operand) })', 'operand: predicate.operand })'],
    [
      'Contains',
      'value: rewrite(predicate.value),\n        search:',
      'value: predicate.value,\n        search:',
    ],
    [
      'In',
      'value: rewrite(predicate.value),\n        among:',
      'value: predicate.value,\n        among:',
    ],
    [
      'And and Or',
      'operands: Arr.map(predicate.operands, operand => substituted(operand, rewrite)),',
      'operands: predicate.operands,',
    ],
    ['Not', 'operand: substituted(predicate.operand, rewrite) })', 'operand: predicate.operand })'],
    ['Compare', 'left: rewrite(predicate.left),', 'left: predicate.left,'],
  ].map(([what, find, replace]) =>
    edit(`${what} is not substituted`, find!, replace!, '../src/expr.ts'),
  ),
]
