/**
 * A write a held `may` forbids, refused where it is made, each step broken in
 * turn: `pnpm mutate packages/remote/test/localForbidden.mutations.ts`.
 */
const remote = 'packages/remote/test/localForbidden.test.ts'
const guard = 'packages/guard/test/mayForbids.test.ts'
const law = 'examples/chirp/test/law.test.ts'
const edit = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })
const mutation = '../src/mutation.ts'
const index = '../src/index.ts'
const may = '../../guard/src/may.ts'

export default [
  edit(
    'nothing held forbids a write',
    mutation,
    'const forbidders = forbiddersOf(entity)',
    'const forbidders: ReadonlyArray<readonly [string, Forbids]> = []',
    [remote, guard, law],
  ),
  edit(
    'a member not held is asked as if it said nothing',
    mutation,
    'held.present.has(key) ? forbids(held.values[key], asked) : Option.none(),',
    'forbids(held.values[key], asked),',
    [remote],
  ),
  edit(
    'an update is asked without the members it writes',
    mutation,
    '...Object.keys(bound.values),',
    '',
    [remote, guard],
  ),
  edit(
    'a link is asked as an unlink',
    mutation,
    "interaction: Option.isSome(link) ? 'Link' : 'Unlink',",
    "interaction: Option.isSome(link) ? 'Unlink' : 'Link',",
    [guard],
  ),
  edit(
    'the refusal loses its words',
    '../src/writes.ts',
    'onSome: said => ({ reason: said }),',
    'onSome: () => ({}),',
    [remote],
  ),
  edit(
    'an invariant is judged before who may write',
    '../src/writes.ts',
    '          : Option.orElse(\n              Option.map(\n                forbiddenByWrite(',
    '          : ((first: any, second: any) => Option.orElse(second(), () => first))(\n              Option.map(\n                forbiddenByWrite(',
    [remote],
  ),
  edit(
    "may's row refusal is not read",
    may,
    'if (refuses(value.row, surface.kind)) {',
    'if (false) {',
    [guard, law],
  ),
  edit(
    "may's member refusal is not read",
    may,
    'const member = surface.members.some(key => refuses(value.members, key))',
    'const member = false',
    [guard],
  ),
  edit(
    "may's relation refusal is not read",
    may,
    'Object.hasOwn(value.relations, relation) && !value.relations[relation]![interaction],',
    'false,',
    [guard],
  ),
  edit(
    'the law compares a refusal of who asks as nothing',
    '../src/law.ts',
    'answer.error.refusal ?? answer.error._tag,',
    'answer.error.refusal,',
    [law],
  ),
]
