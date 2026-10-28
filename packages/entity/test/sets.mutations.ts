/**
 * `Entity.sets` and the writes that follow it, broken in turn:
 * `pnpm mutate packages/entity/test/sets.mutations.ts`.
 */
const tests = ['packages/entity/test/sets.test.ts']
const sets = '../src/sets.ts'
const entity = '../src/index.ts'
const write = '../src/write.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('any write is named', sets, "if (on !== 'create' && on !== 'write') {", 'if (false) {'),
  edit('the id may be set', sets, "if (key === 'id') return fail(", 'if (false) return fail('),
  edit(
    'a member may be set twice',
    sets,
    'if (Object.hasOwn(entity.sets, key)) return fail(',
    'if (false) return fail(',
  ),
  edit(
    'a value from the input is taken',
    sets,
    "if (tag !== 'Viewer' && tag !== 'Now' && tag !== 'ViewerPath') {",
    'if (false) {',
  ),
  edit(
    'a many relation may be set',
    sets,
    "if (member.cardinality !== 'one') return fail(",
    'if (false) return fail(',
  ),
  edit(
    'a relation takes the viewer of any Entity',
    sets,
    "context._tag !== 'Viewer' || context.entity.token !== target.identity.token",
    "context._tag !== 'Viewer'",
  ),
  edit('the time goes into text', sets, "stored === 'number' ||", 'true ||'),
  edit('the viewer goes into a number', sets, "stored === 'text' ||", 'true ||'),
  edit('a key that is no member is kept', sets, 'if (member === undefined) {', 'if (false) {'),
  edit(
    'the sets are not kept',
    entity,
    '      sets: Object.freeze(parts.sets),\n',
    '      sets: {},\n',
  ),
  edit(
    'an update sets what only a create does',
    write,
    "on === 'write' && set.on === 'create'",
    'false',
  ),
  edit(
    'an insert sets nothing',
    write,
    "context: contextOf(input.entity, 'create'),",
    'context: [],',
  ),
  edit(
    'an input may set a member the context sets',
    write,
    'if (written !== undefined)\n',
    'if (false)\n',
  ),
  edit(
    'an input may move a member the context sets',
    write,
    '    ...increments.map(increment => increment.field.key),\n    ...assignments',
    '    ...assignments',
  ),
  edit('the context alone sets nothing', write, '  write.context.length === 0\n', '  true\n'),
  edit(
    'a member the context sets is not among what a write writes',
    write,
    '    ...write.context.map(set => set.member),\n',
    '',
  ),
  edit(
    'a null is written where the member holds none',
    write,
    '} else if (comes.value !== null || holdsNull(member)) {',
    '} else if (true) {',
  ),
  edit(
    'a required relation points nowhere',
    write,
    'else if (member.optional) links[member.key] = Option.none()',
    'else if (true) links[member.key] = Option.none()',
  ),
  edit(
    'a missing time is not named',
    write,
    '        if (Option.isNone(comes)) {\n          unfilled.push(member.key)',
    '        if (Option.isNone(comes)) {\n          void 0',
  ),
]
