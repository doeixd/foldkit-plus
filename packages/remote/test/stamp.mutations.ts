/**
 * An insert's stamps and a new row's derived members, predicted, broken in
 * turn: `pnpm mutate packages/remote/test/stamp.mutations.ts`.
 */
const tests = ['packages/remote/test/stamp.test.ts']
const file = '../src/mutation.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an insert shows none of its stamped fields',
    '    values: { ...bound.values, ...stamps.values },',
    '    values: bound.values,',
  ),
  edit(
    'an insert points none of its stamped links',
    '    links: { ...bound.links, ...stamps.links },',
    '    links: bound.links,',
  ),
  edit(
    'the derived members do not see a stamped link',
    "const bound = stampedBound(write, input, write._tag === 'Update' ? keys : undefined, stamping)",
    "const bound = DomainWrite.bind(write, input as never, write._tag === 'Update' ? keys : undefined)",
  ),
  edit(
    'the clock is the first time the page heard',
    'entry.updatedAt > latest',
    'latest === -Infinity',
  ),
  edit(
    'the clock reads 0 on a page that heard nothing',
    'return latest === -Infinity ? Option.none() : Option.some(latest)',
    'return Option.some(latest === -Infinity ? 0 : latest)',
  ),
  edit('a new row is counted as liked once', 'Count: () => 0,', 'Count: () => 1,'),
  edit("a new row's exists is not predicted", 'Exists: () => null })', "Exists: () => 'l0' })"),
  edit(
    'a new row shows no derived members',
    '        Insert: () => freshDerived(write, input, context.derived),',
    '        Insert: () => [],',
  ),
  edit(
    'the viewer is not passed to the stamps',
    'const stamping = { viewer: context.viewer, now: lastHeard(context.store) }',
    'const stamping = { viewer: Option.none(), now: lastHeard(context.store) }',
  ),
  {
    name: 'a pending create joins no list',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (!holds.has(entityKey(change.entity, change.id)) && !created) continue',
        replace: 'if (!holds.has(entityKey(change.entity, change.id))) continue',
      },
    ],
    tests: [...tests, 'examples/chirp/test/post.test.ts'],
  },
]
