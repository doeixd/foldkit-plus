/**
 * A `Derived.count`'s prediction, each step broken in turn:
 * `pnpm mutate packages/remote/test/derivedCount.mutations.ts`.
 */
const tests = ['packages/remote/test/derivedCount.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a declared write predicts no count',
    '../src/mutation.ts',
    'context.derived.get(write.input.entity.name) ?? [],',
    '[],',
  ),
  edit(
    'no count is registered',
    '../src/index.ts',
    'DerivedBy.Count({ relation: relation.key, owner: entity.name, field }),',
    'DerivedBy.Count({ relation: "none", owner: entity.name, field }),',
  ),
  edit(
    'a row not held points nowhere',
    '../src/mutation.ts',
    "return write._tag === 'Insert' ? Option.some(null) : Option.none()",
    'return Option.some(null)',
  ),
  edit(
    'a held row with no ref is read as pointing nowhere',
    '../src/mutation.ts',
    'if (held !== undefined && held.present.has(relation))',
    'if (held !== undefined)',
  ),
  edit(
    'an unheld count is moved',
    '../src/mutation.ts',
    "if (!Option.exists(holding(ref, field), value => typeof value === 'number')) return",
    '',
  ),
  edit(
    'a delete points where it did',
    '../src/mutation.ts',
    'Delete: () => Option.some<unknown>(null),',
    'Delete: () => Option.none(),',
  ),
  edit('nothing is taken away', '../src/mutation.ts', 'count(from.value, owner, field, -1)', ''),
]
