/**
 * `Projection.derive`: `pnpm mutate packages/surface/test/derive.mutations.ts`.
 */
const tests = ['packages/surface/test/derive.test.ts', 'packages/mixins/test/region.test.ts']

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/index.ts', find, replace }],
  tests,
})

export default [
  edit('a derivation is worked out on every read', 'before === undefined\n', 'true\n'),
  edit(
    'a derivation giving the same fields hands out the new value',
    ': keepAlike(before.value, derive(root))',
    ': derive(root)',
  ),
  {
    ...edit(
      "a Projection's paths are not read",
      'RefTypeId in entry ? { dependencies: [entry[RefTypeId].dependency] } : entry,',
      'RefTypeId in entry ? { dependencies: [entry[RefTypeId].dependency] } : { dependencies: [] },',
    ),
    tests: ['packages/surface/test/derive.test.ts'],
  },
  edit('a derivation from nothing is made', 'if (on.length === 0) {', 'if (false) {'),
  // #385: what reads no path of its own cannot be skipped by the paths.
  edit('a read no path names is skipped while the paths hold', '!always && values', 'values'),
  edit(
    'a read that declares no path counts as named',
    'entry.dependencies.length === 0 || readsUnnamed.has(entry)',
    'readsUnnamed.has(entry)',
  ),
  edit(
    'a Projection composing such a read counts as named',
    'entry.dependencies.length === 0 || readsUnnamed.has(entry)',
    'entry.dependencies.length === 0',
  ),
  edit(
    'a struct is not marked by such a read',
    '      nesteds,\n    ) as unknown as Projection<EntryRoot',
    '      [],\n    ) as unknown as Projection<EntryRoot',
  ),
  edit('a field an of picks counts as named', 'parts.push({ dependencies: [] })', ''),
  edit(
    'an array is not marked by what it maps',
    'read: root => root.map(value => projection.read(value)),\n      },\n      [projection],',
    'read: root => root.map(value => projection.read(value)),\n      },\n      [],',
  ),
  edit(
    'an option is not marked by what it maps',
    'read: root => Option.map(root, value => projection.read(value)),\n      },\n      [projection],',
    'read: root => Option.map(root, value => projection.read(value)),\n      },\n      [],',
  ),
  edit('a derivation is not marked by such a read', 'if (always) readsUnnamed.add(derived)', ''),
]
