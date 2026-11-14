/** What invariants, refinements and the enumerator share in reading an Entity's rows. */
import type { Row } from './evaluate.js'
import { Held } from './held.js'
import type { OneRelation } from './expr.js'
import type { AnyEntity, EntityMember } from './index.js'

/** An Entity's `one` relations: a row holds each as the id it points at; a `many` holds no one value. */
export const oneRelations = (entity: AnyEntity): ReadonlyArray<OneRelation> =>
  Object.values(entity.relations as Readonly<Record<string, EntityMember>>).flatMap(member =>
    member._tag === 'Relation' && member.cardinality === 'one' ? [member as OneRelation] : [],
  )

/** A row as stored, held: a key it lacks is unheld, so a rule reading it is undecided. */
export const heldRow = (entity: AnyEntity, row: Row) =>
  Held.rows([{ entity, rows: [row], complete: false }]).rows(entity)[0]!
