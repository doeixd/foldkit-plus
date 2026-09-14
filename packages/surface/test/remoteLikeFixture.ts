import { Schema } from 'effect'
import { Metadata, Projection } from '../src/index.js'

/** A Remote-shaped interpreter that knows nothing of `flagsLikeFixture`. */
export interface EntityNeed {
  readonly entity: string
  readonly id: string
  readonly fields: readonly string[]
}

export const EntityNeeds = Metadata.key<EntityNeed>('remote-like', {
  merge: needs => {
    const byEntity = new Map<string, EntityNeed>()
    for (const need of needs) {
      const key = `${need.entity}:${need.id}`
      const current = byEntity.get(key)
      byEntity.set(
        key,
        current === undefined
          ? need
          : { ...current, fields: [...new Set([...current.fields, ...need.fields])] },
      )
    }
    return [...byEntity.values()]
  },
  summarize: need => `${need.entity}:${need.id} [${need.fields.join(', ')}]`,
})

export const entity = (entity: string, id: string, fields: readonly string[]) =>
  Projection.fromReader(Schema.Unknown as Schema.Schema<unknown>, (_root: unknown) => null, {
    metadata: EntityNeeds.of({ entity, id, fields }),
  })
