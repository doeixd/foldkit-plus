/** Mutations for `Machine.lift` and `Machine.compose`: the lifting, the naming and the refusal of a shared tag. */
const file = '../src/machine.ts'
const blocks = 'packages/metakit/test/blocks.test.ts'
const surface = 'packages/surface/test/writesComposed.test.ts'

const mutation = (name: string, find: string, replace: string, tests = [blocks]) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  mutation(
    'a lifted Machine keeps its transitions over the child state',
    'Transition.lift(at, transition as Transition.Transition<Child, unknown, unknown, unknown>),',
    'transition,',
    [blocks, surface],
  ),
  mutation(
    'a Machine is lifted to the root, whatever the path',
    'const at = Path.make<Outer, Child>(path.segments, path.ast)',
    'const at = Path.make<Outer, Child>([], path.ast)',
    [blocks, surface],
  ),
  mutation(
    // Dropping the name outright fails at definition (two children share every tag), which no test sees.
    "a child's name follows its tag",
    'add(`${name}${tag}`, transition, `the child "${name}"`)',
    'add(`${tag}${name}`, transition, `the child "${name}"`)',
  ),
  mutation(
    'a shared tag keeps the first transition',
    'if (first !== undefined) {\n      throw new Error(',
    'if (first !== undefined) return\n    if (false) {\n      throw new Error(',
  ),
  mutation(
    'a shared tag keeps the last transition',
    'if (first !== undefined) {\n      throw new Error(',
    'if (false) {\n      throw new Error(',
  ),
  mutation(
    "a composition leaves out the parent's own transitions",
    "add(tag, transition, 'the transitions')",
    '',
  ),
]
