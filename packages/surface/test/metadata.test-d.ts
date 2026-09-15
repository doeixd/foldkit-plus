import type { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Metadata, type ParamsSchema } from '../src/index.js'
import { Flags, flag } from './flagsLikeFixture.js'
import { EntityNeeds, entity, type EntityNeed } from './remoteLikeFixture.js'

expectTypeOf(Flags.get(flag('beta').metadata)).toEqualTypeOf<ReadonlyArray<string>>()
expectTypeOf(EntityNeeds.get(entity('Project', 'p1', ['name']).metadata)).toEqualTypeOf<
  ReadonlyArray<EntityNeed>
>()

// @ts-expect-error a flag entry is a string
Flags.of(42)

// @ts-expect-error an entry must be the key's declared shape
EntityNeeds.of({ entity: 'Project', id: 'p1' })

Metadata.key<string>('mismatched', {
  merge: values => values,
  // @ts-expect-error summarize receives the key's own value type
  summarize: (value: number) => String(value),
})

// @ts-expect-error metadata comes from a key or from composition, never an object literal
Flags.get({ entries: new Map() })

expectTypeOf<ParamsSchema<void>>().toEqualTypeOf<undefined>()
expectTypeOf<ParamsSchema<undefined>>().toEqualTypeOf<
  Schema.Codec<undefined, unknown> | undefined
>()
expectTypeOf<ParamsSchema<void | string>>().toEqualTypeOf<
  Schema.Codec<void | string, unknown> | undefined
>()
expectTypeOf<ParamsSchema<string>>().toEqualTypeOf<Schema.Codec<string, unknown>>()
