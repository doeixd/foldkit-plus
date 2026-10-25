/**
 * Transitions and the Next node they read the row after through, each step
 * broken in turn: `pnpm mutate packages/entity/test/transition.mutations.ts`
 * checks that a test fails for every one.
 */
const file = '../src/transition.ts'
const tests = [
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
    'an id may be declared twice',
    'if (taken.some(held => held.id === id)) fail(entity, `"${id}" is declared twice`)',
    '',
  ),
  edit(
    'an invariant may take a transition’s id',
    'const taken = [...invariantsOf(entity), ...transitionsOf(entity)]',
    'const taken = invariantsOf(entity)',
    '../src/invariant.ts',
  ),
  edit('a transition may read an input', 'if (dependencies.inputs.length > 0) {', 'if (false) {'),
  edit(
    'the row after is not given',
    'truthOver(held.predicate, before, {}, after) !== true',
    'truthOver(held.predicate, before) !== true',
  ),
  edit('a missing field is judged', 'if (absent.length > 0) absent', 'if (false) absent'),
  edit(
    'the path defaults to nothing',
    'options.path ?? [...new Set([...before, ...afterReads])]',
    'options.path ?? []',
  ),
  edit(
    'a value the write sets is not read after',
    'Object.hasOwn(values, field.key) ? literal(values[field.key]) : operand',
    'operand',
    '../src/expr.ts',
  ),
  edit(
    'the row after is read as the row before',
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
]
