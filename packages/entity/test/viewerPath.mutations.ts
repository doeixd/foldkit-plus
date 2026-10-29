/**
 * A path from the viewer, broken in turn:
 * `pnpm mutate packages/entity/test/viewerPath.mutations.ts`.
 */
const tests = ['packages/entity/test/viewerPath.test.ts']
const expr = '../src/expr.ts'
const write = '../src/write.ts'
const sets = '../src/sets.ts'
const evaluate = '../src/evaluate.ts'
const held = '../src/held.ts'
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
    'a visitor starts a path from the viewer',
    evaluate,
    '      if (id === null) return null\n',
    '',
  ),
  edit(
    "a path from the viewer reads the viewer's own row",
    evaluate,
    ': reached(start, node.via)',
    ': start',
  ),
  edit(
    'a row the holder knows absent is unknown',
    evaluate,
    'onHeld: found => Option.match(found, { onNone: () => null, onSome: viewOf }),',
    "onHeld: found => Option.match(found, { onNone: () => new Unheld('x'), onSome: viewOf }),",
  ),
  edit(
    'a holder finds a row it lacks absent from an incomplete table',
    held,
    '            reached.complete\n',
    '            true\n',
  ),
  edit(
    'a path from the viewer reaches no other row',
    expr,
    "      found.operations.add('path')\n      found.reaches.push(expr)\n      return\n    case 'Exists'",
    "      found.operations.add('path')\n      return\n    case 'Exists'",
  ),
  edit(
    'a list orders by a path from the viewer',
    expr,
    'ViewerPath: (path): Option.Option<Collation> => {\n',
    'ViewerPath: (path): Option.Option<Collation> => {\n        if (path) return Option.none()\n',
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
