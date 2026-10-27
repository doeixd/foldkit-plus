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
    '../src/index.ts',
    'definition.registry.counts.get(mutation.write.input.entity.name) ?? [],',
    '[],',
  ),
  edit(
    'no count is registered',
    '../src/index.ts',
    'by.push({ relation: relation.key, owner: entity.name, field })',
    'void by',
  ),
  edit(
    'a row not held points nowhere',
    '../src/mutation.ts',
    "write._tag === 'Insert'\n        ? Option.some(null)\n        : Option.none()",
    'Option.some(null)',
  ),
  edit(
    'a held row with no ref is read as pointing nowhere',
    '../src/mutation.ts',
    '        ? Option.some(held.values[relation])\n        : Option.none()',
    '        ? Option.some(held.values[relation])\n        : Option.some(null)',
  ),
  edit(
    'an unheld count is moved',
    '../src/mutation.ts',
    "if (target === undefined || target.tombstone || typeof target.values[field] !== 'number') return",
    '',
  ),
  edit(
    'a delete points where it did',
    '../src/mutation.ts',
    'Delete: () => Option.some<unknown>(null),',
    'Delete: () => Option.none(),',
  ),
  edit('nothing is taken away', '../src/mutation.ts', 'move(from.value, owner, field, -1)', ''),
]
