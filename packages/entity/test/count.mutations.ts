/**
 * `Derived.count`, each check broken in turn:
 * `pnpm mutate packages/entity/test/count.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/entity/test/count.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('a many relation is counted', "if (relation.cardinality !== 'one')", 'if (false)'),
  edit(
    'a relation pointing elsewhere is counted',
    'if (!isSameEntity(relation.target(), entity))',
    'if (false)',
  ),
  edit('the derivation is dropped', '          derives: spec.derives,\n', ''),
  edit(
    'a count may be negative',
    'Schema.isGreaterThanOrEqualTo(0)',
    'Schema.isGreaterThanOrEqualTo(-1)',
  ),
  edit('a count may be a fraction', 'Schema.Number.check(Schema.isInt(), ', 'Schema.Number.check('),
  edit("an exists's relation is not checked", "pointingHere(relation, 'reads')", 'undefined'),
  edit(
    "an exists's viewer may be another Entity's",
    'viewer.owner.token !== relation.owner.token ||',
    'false ||',
  ),
  edit("an exists's viewer may be its relation", '|| viewer.key === relation.key)', '|| false)'),
  edit('an exists holds a bare string', 'Schema.OptionFromNullOr(Schema.String)', 'Schema.String'),
]
