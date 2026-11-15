import { Schema } from 'effect'
import { Entity, Footprint } from 'foldkit-entity'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, count: Schema.Number }))
const Other = Entity.define('Other', Schema.Struct({ id: Schema.String, label: Schema.String }))

/** `Laws.check` throws on this: the footprint names `Other`'s fields on an entry over `Item`. */
export default {
  writes: [
    {
      name: 'Stray',
      entity: Item,
      footprint: Footprint.declared({ writes: [Other.fields.label], by: 'the test' }),
    },
  ],
}
