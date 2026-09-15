import { Schema } from 'effect'
import { Metadata, Projection } from '../src/index.js'

/** A feature-flag interpreter that knows nothing of `remoteLikeFixture`. */
export const Flags = Metadata.key<string>('flags', {
  merge: flags => [...new Set(flags)],
  summarize: flag => flag,
})

export const flag = (name: string) =>
  Projection.fromReader(Schema.Boolean, (_root: unknown) => false, {
    metadata: Flags.of(name),
  })
