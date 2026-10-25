/**
 * Transitions, each step broken in turn:
 * `pnpm mutate packages/entity/test/transition.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/transition.ts'
const tests = ['packages/entity/test/transition.test.ts']
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
  edit('a transition may read an input', 'if (foreign.length > 0) {', 'if (false) {'),
  edit(
    'the row after is not given',
    'truthOver(held.predicate, before, input) !== true',
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
    'if (Object.hasOwn(values, field)) return Expr.literal(values[field])',
    '',
  ),
  edit('a moved field is read as itself', 'if (!moved.has(field)) return scalar', 'return scalar'),
  edit(
    'no input is substituted',
    "Match.tag('Input', input => Option.getOrElse(replace(input.key), () => operand)),",
    '',
    '../src/expr.ts',
  ),
]
