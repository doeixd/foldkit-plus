/**
 * Entity identity and projection helpers.
 *
 * A Remote entity must expose an `id`; every read needs it even when the client
 * did not ask for it, so `idColumn` is the single place that enforces it.
 */
import type { AnyColumn } from 'drizzle-orm'
import type { AnyWrite } from 'foldkit-entity'
import type { AnyEntityBinding, RelationBinding } from './binding.js'

const missingId = (name: string): never => {
  throw new Error(
    `[foldkit-remote-drizzle] entity "${name}" has no "id" column; a Remote entity must expose one`,
  )
}

export const idColumn = (binding: AnyEntityBinding): AnyColumn =>
  binding.columns.id ?? missingId(binding.name)

/** Whether at least one requested field maps to a column, relation, or computed value. */
export const projectsAny = (binding: AnyEntityBinding, fields: Iterable<string>): boolean => {
  for (const field of fields) {
    if (
      binding.columns[field] !== undefined ||
      binding.relations[field] !== undefined ||
      binding.computed[field] !== undefined
    ) {
      return true
    }
  }
  return false
}

/**
 * Each member stored on the column of a member `Entity.sets` names, that is
 * not set itself: the server writes the context's value to that column, and a
 * write of the other member overwrites it there.
 */
export const contextSharers = (
  sets: Readonly<Record<string, unknown>>,
  columns: Readonly<Record<string, AnyColumn>>,
  relations: Readonly<Record<string, RelationBinding>>,
): ReadonlyArray<{
  readonly set: string
  readonly member: string
  readonly column: string
}> => {
  const stored: Array<readonly [string, AnyColumn]> = [
    ...Object.entries(columns),
    ...Object.entries(relations).flatMap(([key, relation]) =>
      relation.kind === 'one' ? [[key, relation.field] as const] : [],
    ),
  ]
  return stored.flatMap(([set, column]) =>
    Object.hasOwn(sets, set)
      ? stored
          .filter(([member, other]) => other === column && !Object.hasOwn(sets, member))
          .map(([member]) => ({ set, member, column: column.name }))
      : [],
  )
}

/**
 * Why `write` cannot land through `binding`: each member it writes that is
 * stored on the column of a member its Entity sets from the context. The
 * Entity refuses an input for such a member itself; this is the same rule by
 * column, which only a binding knows. A write's Entity may set what its
 * binding's did not.
 */
export const contextOverwrites = (
  write: AnyWrite,
  binding: AnyEntityBinding,
): ReadonlyArray<string> => {
  const written = new Set([
    ...write.sets.map(set => set.field.key),
    ...write.links.map(link => link.relation.key),
    ...write.increments.map(increment => increment.field.key),
    ...write.assignments.map(assignment => assignment.field.key),
  ])
  return contextSharers(write.input.entity.sets, binding.columns, binding.relations)
    .filter(({ member }) => written.has(member))
    .map(
      ({ set, member, column }) =>
        `it writes "${member}", stored on column "${column}" with "${set}", which the write's context sets; no input sets it`,
    )
}
