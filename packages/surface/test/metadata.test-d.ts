import { expectTypeOf } from 'vitest'
import { Metadata } from '../src/index.js'
import { Flags } from './flagsLikeFixture.js'
import { EntityNeeds, type EntityNeed } from './remoteLikeFixture.js'

expectTypeOf(Flags.get(Metadata.empty)).toEqualTypeOf<ReadonlyArray<string>>()
expectTypeOf(EntityNeeds.get(Metadata.empty)).toEqualTypeOf<ReadonlyArray<EntityNeed>>()

// @ts-expect-error a flag entry is a string
Flags.of(42)

// @ts-expect-error an entry must be the key's declared shape
EntityNeeds.of({ entity: 'Project', id: 'p1' })

Metadata.key<string>('mismatched', {
  merge: values => values,
  // @ts-expect-error summarize receives the key's own value type
  summarize: (value: number) => String(value),
})
