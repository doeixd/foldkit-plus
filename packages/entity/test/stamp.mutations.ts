/**
 * `Entity.stamps` and the writes that follow it, broken in turn:
 * `pnpm mutate packages/entity/test/stamp.mutations.ts`.
 */
const tests = ['packages/entity/test/stamp.test.ts']
const entity = '../src/index.ts'
const write = '../src/write.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the id may be stamped',
    entity,
    "if (key === 'id') fail(entity, 'stamps the id, which the client names')",
    '',
  ),
  edit(
    'a member may be stamped twice',
    entity,
    'if (Object.hasOwn(entity.stamps, key)) fail(entity, `"${key}" is stamped already`)',
    '',
  ),
  edit(
    'a many relation may be stamped',
    entity,
    'if (relation.cardinality !== \'one\') fail(entity, `stamps "${key}", a many relation`)',
    '',
  ),
  edit(
    'a relation may take the clock',
    entity,
    'Clock: () => fail(entity, `stamps the relation "${key}" with the clock`),',
    'Clock: () => undefined,',
  ),
  edit('the clock goes into text', entity, 'stored.every(SchemaAST.isNumber) ||', 'true ||'),
  edit('the viewer goes into a number', entity, 'stored.every(SchemaShape.isText) ||', 'true ||'),
  edit(
    'a key that is no member is kept',
    entity,
    '} else fail(entity, `stamps "${key}", which is not a field or relation`)',
    '}',
  ),
  edit(
    'the stamps are not kept',
    entity,
    '      stamps: Object.freeze(parts.stamps),\n',
    '      stamps: {},\n',
  ),
  edit('an input may set a stamped member', write, 'if (stamped !== undefined)\n', 'if (false)\n'),
  edit(
    'an input may link a stamped relation',
    write,
    '...links.map(link => link.relation.key)].find(',
    '].find(',
  ),
  edit('an insert stamps nothing', write, 'stamps: stampsOf(input.entity) }),', 'stamps: [] }),'),
  edit(
    'a stamped relation is written as a field',
    write,
    'Object.hasOwn(relations, key)\n      ? WriteStamp.Link',
    'false\n      ? WriteStamp.Link',
  ),
  edit('a stamp alone sets nothing', write, '  write.stamps.length === 0\n', '  true\n'),
  edit(
    'a stamped member is not among what a write writes',
    write,
    '    ...write.stamps.map(\n',
    '    ...[].map(\n',
  ),
  edit(
    'a relation takes a viewer of any Entity',
    write,
    'Option.match(viewerIdOf(relation.target(), by), {',
    'Option.match(Option.map(by.viewer, viewer => viewer.id), {',
  ),
  edit(
    'a missing clock is not named',
    write,
    'onNone: () => void unknown.push(field.key),',
    'onNone: () => undefined,',
  ),
]
