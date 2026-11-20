/**
 * Mutations proving the tests of metakit's consumers (`machine`, `inspect`,
 * `sql`, `drizzle`, `prove`, `graph`) catch what an independent review found
 * unguarded:
 *   `pnpm mutate packages/metakit/test/consumers-review.mutations.ts`
 */
const machine = '../src/machine.ts'
const inspect = '../src/inspect.ts'
const integrationTests = ['packages/metakit/test/integrations.test.ts']

const mutation = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  mutation(
    'a tag naming a member of Object.prototype is taken for a transition',
    machine,
    'Object.hasOwn(config.transitions, tag)',
    'config.transitions[tag] !== undefined',
    integrationTests,
  ),
  mutation(
    'a tag naming no transition can be dispatched',
    machine,
    'onNone: () => Verdict.False(),',
    "onNone: () => Verdict.Unknown('no such transition'),",
    integrationTests,
  ),
  mutation(
    'a nullable enum lists no null',
    inspect,
    'enum: spec.nullable ? [...literals, null] : literals',
    'enum: literals',
    integrationTests,
  ),
  mutation(
    'the literals under NullOr are not read as an enum',
    inspect,
    'present.length === 1 && SchemaAST.isUnion(inner) ? inner.types : present',
    'present',
    integrationTests,
  ),
]
