/**
 * A path from the viewer, broken in turn:
 * `pnpm mutate packages/entity/test/viewerPath.mutations.ts`.
 */
const tests = ['packages/entity/test/viewerPath.test.ts']
const relation = '../src/expr/relation.ts'
const dependencies = '../src/expr/dependencies.ts'
const order = '../src/expr/order.ts'
const write = '../src/write.ts'
const sets = '../src/sets.ts'
const environment = '../src/environment.ts'
const held = '../src/held.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an end on another Entity is taken',
    relation,
    'if (owner.token !== from.identity.token) {',
    'if (false) {',
  ),
  edit(
    'a visitor starts a path from the viewer',
    environment,
    '// A visitor, or a viewer of another Entity.\n          onNone: () => null,',
    '// A visitor, or a viewer of another Entity.\n          onNone: () => ({}),',
  ),
  edit(
    "a path from the viewer reads the viewer's own row",
    relation,
    'made(reached(start, via, field), {',
    'made(reached(start, [], field), {',
  ),
  edit(
    'a row the holder knows absent is unknown',
    environment,
    'for (const key of fields.keys()) put(hidden, key, null)',
    '',
  ),
  edit(
    'a holder finds a row it lacks absent from an incomplete table',
    held,
    '            reached.complete\n',
    '            true\n',
  ),
  edit(
    'a path from the viewer reaches no other row',
    dependencies,
    "      ViewerHop: ({ viewer, via, field }) =>\n        Option.some<Reach>({ _tag: 'ViewerPath', viewer, via, field, expr: exprOf(node) }),",
    '      ViewerHop: () => Option.none<Reach>(),',
  ),
  edit(
    'a list orders by a path from the viewer',
    order,
    "ViewerHop: () => Option.some('a path from the viewer'),",
    'ViewerHop: () => Option.none<string>(),',
  ),
  edit(
    'a path from the viewer follows none of its relations',
    relation,
    "{ _tag: 'ViewerHop', viewer: from, via, field }",
    "{ _tag: 'ViewerHop', viewer: from, via: [], field }",
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
    'onUnheld: () => end,',
    'onUnheld: () => Held.of(null),',
  ),
  edit(
    'a viewer of any Entity starts the path',
    write,
    'Option.match(viewerIdOf(path.viewer, by), {',
    'Option.match(Option.map(by.viewer, viewer => viewer.id), {',
  ),
  edit(
    'a path names no Entity it reads past the viewer',
    write,
    'return [viewer.name, ...via.map(relation => relation.target().name)]',
    'return [viewer.name]',
  ),
  edit(
    "a path's end need not fit its field",
    sets,
    "if (stored === 'other' || storedAs(field.schema) !== stored) {",
    'if (false) {',
  ),
]
