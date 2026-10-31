/**
 * Records keyed by a caller's name, read or written as a plain object again
 * (#329, #330 and the sweep after #311):
 * `pnpm mutate packages/entity/test/protoKey.mutations.ts`.
 */
const tests = ['packages/entity/test/protoKey.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const write = '../src/write.ts'
const entity = '../src/entity.ts'
const descriptor = '../src/descriptor.ts'

export default [
  // ---- #330
  edit(
    'an input row is built by assignment',
    '../src/invariant.ts',
    'encoded => put(row, member.key, encoded),',
    'encoded => void (row[member.key] = encoded),',
  ),
  edit(
    'a checked row is built by assignment',
    '../src/invariant.ts',
    '      put(\n        row,\n        key,\n',
    '      ((k: string, v: unknown) => void (row[k] = v))(\n        key,\n',
  ),
  // ---- #329
  edit(
    'a bound value is assigned',
    write,
    'held => put(values, field.key, encoded(field, held))',
    'held => void (values[field.key] = encoded(field, held))',
  ),
  edit(
    'a bound increment is assigned',
    write,
    'put(increments, field.key, Schema.encodeUnknownSync(schema)(held)),',
    'void (increments[field.key] = Schema.encodeUnknownSync(schema)(held)),',
  ),
  edit(
    'a bound link is assigned',
    write,
    '      put(\n        links,\n        relation.key,\n',
    '      ((k: string, v: Option.Option<EntityRef>) => void (links[k] = v))(\n        relation.key,\n',
  ),
  edit(
    'a bound assignment is assigned',
    write,
    'put(assignments, field.key, computationOf(write, expr, input))',
    'assignments[field.key] = computationOf(write, expr, input)',
  ),
  edit(
    'a computed field is assigned to the row after',
    write,
    'onSome: value => put(after, field, value),',
    'onSome: value => void (after[field] = value),',
  ),
  edit(
    'a context value is assigned',
    write,
    'put(values, member.key, comes.value)',
    'values[member.key] = comes.value',
  ),
  edit(
    'a context link is assigned',
    write,
    'put(links, member.key, Option.some({ entity: member.target().name, id: String(id) }))',
    'links[member.key] = Option.some({ entity: member.target().name, id: String(id) })',
  ),
  edit(
    'an input key is read with what it inherits',
    write,
    'Option.map(given(own(input, key)), held => put(values',
    'Option.map(given(input[key]), held => put(values',
  ),
  edit(
    'a key a write names is read with what the members inherit',
    write,
    '  const member = own(membersOf(input), key)\n  if (member === undefined) return fail(input, `${role}',
    '  const member = membersOf(input)[key]\n  if (member === undefined) return fail(input, `${role}',
  ),
  edit(
    'an amount key is read with what the members inherit',
    write,
    '  const member = own(membersOf(input), key)\n  if (member === undefined) return fail(input, `"${key}"',
    '  const member = membersOf(input)[key]\n  if (member === undefined) return fail(input, `"${key}"',
  ),
  // ---- the sweep
  edit(
    'an input is read with what it inherits',
    '../src/evaluate.ts',
    'return own(scope.input, node.key)',
    'return scope.input[node.key]',
  ),
  edit(
    'a sort input is read with what it inherits',
    '../src/expr.ts',
    'const sort = own(input, chosen.sort.key)',
    'const sort = input[chosen.sort.key]',
  ),
  edit(
    'a link is read with what the row inherits',
    '../src/held.ts',
    'const ref = own(row, key)',
    'const ref = row[key]',
  ),
  edit(
    'relations may name an inherited key',
    entity,
    'if (!Object.hasOwn(entities, owner))',
    'if (!(owner in entities))',
  ),
  edit(
    'a related Entity is assigned',
    entity,
    'put(related, ownerKey, entity)',
    ';((k: string, v: AnyEntity) => void (related[k] = v))(ownerKey, entity)',
  ),
  edit(
    'a relation is assigned into the Entity’s members',
    descriptor,
    'put(shape.relations, key, member)',
    'void (shape.relations[key] = member)',
  ),
  edit(
    'a derived member is assigned into the Entity’s members',
    descriptor,
    'put(shape.derived, key, member)',
    'void (shape.derived[key] = member)',
  ),
  edit(
    'a set is assigned into the Entity’s sets',
    descriptor,
    'put(shape.sets, key, set)',
    'void (shape.sets[key] = set)',
  ),
  edit(
    'a set is assigned',
    entity,
    'put(added, key, checkedSet(entity, key, value, options.on))',
    'added[key] = checkedSet(entity, key, value, options.on)',
  ),
]
