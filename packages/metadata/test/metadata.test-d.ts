import { expectTypeOf } from 'vitest'
import { Metadata } from '../src/index.js'

const Tags = Metadata.key<string>('tags', { merge: values => values, summarize: tag => tag })

expectTypeOf(Tags.get(Tags.of('a'))).toEqualTypeOf<ReadonlyArray<string>>()

// @ts-expect-error an entry must be the key's declared type
Tags.of(42)

Metadata.key<string>('mismatched', {
  merge: values => values,
  // @ts-expect-error summarize receives the key's own value type
  summarize: (value: number) => String(value),
})

// @ts-expect-error metadata comes from a key or from `combine`, never an object literal
Tags.get({ entries: new Map() })
