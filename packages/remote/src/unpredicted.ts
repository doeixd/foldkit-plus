/**
 * The members a list selects that a declared insert of its Entity cannot
 * show while pending (#342). A row a pending insert makes holds what its
 * input maps, what its Entity sets on create (`Entity.sets`), its counts and
 * exists, and what a supplied member foresees; a list that selects anything
 * else of the row cannot draw it until the answer, and reads `Refreshing`
 * meanwhile.
 */
import { Option } from 'effect'
import { Derivation, type AnyEntity, type AnyWrite } from 'foldkit-entity'

/** Each member a pending row of `write`, an insert, may hold. */
const predictable = (write: AnyWrite): ReadonlySet<string> => {
  const entity: AnyEntity = write.input.entity
  const derived = Object.entries(entity.derived).flatMap(([key, member]) =>
    Derivation.$match(member.derives, {
      Count: () => [key],
      Exists: () => [key],
      Supplied: ({ predict }) => (Option.isSome(predict) ? [key] : []),
    }),
  )
  return new Set([
    write.id.field.key,
    ...write.sets.map(set => set.field.key),
    ...write.links.map(link => link.relation.key),
    ...write.context.map(set => set.member.key),
    ...write.assignments.map(assignment => assignment.field.key),
    ...derived,
  ])
}

/**
 * The members of `selected` a pending row of `write`, an insert, cannot hold:
 * the fields, relations and derived members of its Entity it does not
 * predict. A key that names no member of its Entity is not judged.
 */
export const unpredicted = (
  write: AnyWrite,
  selected: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (write._tag !== 'Insert') return []
  const entity: AnyEntity = write.input.entity
  const held = predictable(write)
  const member = (key: string) =>
    Object.hasOwn(entity.fields, key) ||
    Object.hasOwn(entity.derived, key) ||
    Object.hasOwn(entity.relations, key)
  return selected.filter(key => member(key) && !held.has(key))
}
