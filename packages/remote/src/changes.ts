/**
 * What a write's answer or a read changed of rows the client held (#378):
 * light, so the core can tell a change without the code that places it.
 */
import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { sameData } from './data.js'
import type { NormalizedPatch } from './ledger.js'
import { entityKey, type EntityStore } from './store.js'

/**
 * One row a write changed: the fields it wrote, and whether the client held
 * no values of the row before (`created`), or its deletion.
 */
export const EntityChange = defineTaggedUnion({
  Changed: {
    entity: Schema.String,
    id: Schema.String,
    fields: Schema.Array(Schema.String),
    created: Schema.Boolean,
  },
  Deleted: { entity: Schema.String, id: Schema.String },
})
export type EntityChange = typeof EntityChange.Type

/**
 * What a mutation's answer changed, against `before`, the store as the server
 * last said it: each patch's fields whose value is new, and each deletion. An
 * answer returns more than it changed (a whole row, say), and counting an
 * unchanged ordering field would refetch every list on every save.
 */
export const changesOf = (
  answer: {
    readonly entities: ReadonlyArray<NormalizedPatch>
    readonly deleted?: ReadonlyArray<{ readonly entity: string; readonly id: string }> | undefined
  },
  before: EntityStore,
): ReadonlyArray<EntityChange> => [
  ...answer.entities.flatMap(patch => {
    const held = before[entityKey(patch.entity, patch.id)]?.values
    const fields = Object.keys(patch.values).filter(
      field =>
        held === undefined ||
        !Object.hasOwn(held, field) ||
        !sameData(held[field], patch.values[field]),
    )
    return fields.length === 0
      ? []
      : [
          EntityChange.Changed({
            entity: patch.entity,
            id: patch.id,
            fields,
            created: held === undefined,
          }),
        ]
  }),
  ...(answer.deleted ?? []).map(gone => EntityChange.Deleted({ entity: gone.entity, id: gone.id })),
]
