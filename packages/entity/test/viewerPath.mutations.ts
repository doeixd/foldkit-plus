/**
 * A path from the viewer, broken in turn:
 * `pnpm mutate packages/entity/test/viewerPath.mutations.ts`.
 */
const tests = ['packages/entity/test/viewerPath.test.ts']
const expr = '../src/expr.ts'
const write = '../src/write.ts'
const sets = '../src/sets.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an end on another Entity is taken',
    expr,
    'if (owner.token !== start.identity.token) {',
    'if (false) {',
  ),
  edit(
    'a query body takes a path from the viewer',
    expr,
    "  if (tag === 'ViewerPath') {",
    '  if (false) {',
  ),
  edit(
    'a path from the viewer follows none of its relations',
    expr,
    '        via: path.via,\n',
    '        via: [],\n',
  ),
  edit(
    'a null link is followed',
    write,
    'if (link.value === null || link.value === undefined) return Held.of(null)',
    '',
  ),
  edit(
    'a link the holder lacks is read as null',
    write,
    "          if (link._tag === 'Unheld') return link\n",
    "          if (link._tag === 'Unheld') return Held.of(null)\n",
  ),
  edit(
    'an end the holder lacks is read as null',
    write,
    "return end._tag === 'Unheld' ? end : Held.of(end.value ?? null)",
    "return Held.of(end._tag === 'Unheld' ? null : (end.value ?? null))",
  ),
  edit(
    'a viewer of any Entity starts the path',
    write,
    'Option.match(viewerIdOf(path.viewer.entity, by), {',
    'Option.match(Option.map(by.viewer, viewer => viewer.id), {',
  ),
  edit(
    'a path names no Entity it reads past the viewer',
    write,
    '[value.viewer.entity.name, ...value.via.map(relation => relation.target().name)]',
    '[value.viewer.entity.name]',
  ),
  edit(
    "a path's end need not fit its field",
    sets,
    "(stored !== 'other' && storedAs(field.schema as unknown as Schema.Top) === stored) ||",
    'true ||',
  ),
]
