/**
 * A `Derived.exists`'s prediction, each step broken in turn:
 * `pnpm mutate packages/remote/test/derivedExists.mutations.ts`.
 */
const tests = ['packages/remote/test/derivedExists.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'no exists is registered',
    '../src/index.ts',
    '            DerivedBy.Exists({\n              relation: relation.key,',
    '            DerivedBy.Exists({\n              relation: "none",',
  ),
  edit(
    'the viewer is not passed',
    '../src/index.ts',
    '                  viewer: viewerOf(model),\n',
    '                  viewer: Option.none(),\n',
  ),
  edit(
    'no row is found by the written one',
    '../src/mutation.ts',
    'Option.contains(holding(key, member.field), bound.id)',
    'false',
  ),
  edit(
    'a found row says nothing of where the row points',
    '../src/mutation.ts',
    'if (member.relation === relation) return Option.some(rows[0])',
    '',
  ),
  edit(
    'a found row says nothing of whom the row points at',
    '../src/mutation.ts',
    'if (member.viewer === relation && Option.isSome(viewerKey)) return viewerKey',
    '',
  ),
  edit(
    'an update reads where the row points as unknown',
    '../src/mutation.ts',
    'Object.hasOwn(bound.links, relation) ? Option.some(patched[relation]) : before(relation),',
    'Object.hasOwn(bound.links, relation) ? Option.some(patched[relation]) : Option.none(),',
  ),
  edit(
    'a row pointed elsewhere keeps its like',
    '../src/mutation.ts',
    'Option.exists(pointed, to => to !== ref) || ',
    '',
  ),
  edit(
    'a row pointed at someone else keeps its like',
    '../src/mutation.ts',
    ' || Option.contains(viewing, false))',
    ')',
  ),
  edit(
    'every writer is the viewer',
    '../src/mutation.ts',
    'Option.map(viewerKey, key => ref === key)',
    'Option.map(viewerKey, () => true)',
  ),
  edit(
    'a row found already is found again',
    '../src/mutation.ts',
    'Option.contains(holding(to, field), null)',
    'true',
  ),
  edit(
    'nothing is found',
    '../src/mutation.ts',
    'at(to, owner).values[field] = bound.id',
    'void to',
  ),
]
