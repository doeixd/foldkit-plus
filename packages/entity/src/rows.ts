/** What invariants, refinements and the enumerator share in reading an Entity's rows. */
import { Match, Option } from 'effect'
import type { Row } from './evaluate.js'
import { Held } from './held.js'
import type { OneRelation } from './expr.js'
import type { AnyEntity, EntityMember } from './index.js'

/** An Entity's `one` relations: a row holds each as the id it points at; a `many` holds no one value. */
export const oneRelations = (entity: AnyEntity): ReadonlyArray<OneRelation> =>
  Object.values(entity.relations as Readonly<Record<string, EntityMember>>).flatMap(member =>
    Match.value(member).pipe(
      Match.tag('Relation', relation =>
        relation.cardinality === 'one' ? [relation as OneRelation] : [],
      ),
      Match.orElse(() => []),
    ),
  )

/** A row as stored, held: a key it lacks is unheld, so a rule reading it is undecided. */
export const heldRow = (entity: AnyEntity, row: Row) =>
  Held.rows([{ entity, rows: [row], complete: false }]).rows(entity)[0]!

/**
 * The id a `one` relation's value names, as a row holds it: a ref's or a
 * nested Selection value's `id`, an id as it is, and null for one pointing
 * nowhere. None for a value naming no id (a nested Selection that left `id` out).
 */
export const linkId = (held: unknown): Option.Option<string | null> =>
  held === null
    ? Option.some(null)
    : typeof held === 'string'
      ? Option.some(held)
      : typeof held === 'object' && 'id' in held && typeof held.id === 'string'
        ? Option.some(held.id)
        : Option.none()
