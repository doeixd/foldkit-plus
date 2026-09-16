import { expectTypeOf } from 'vitest'
import { MediaQuery } from './args.test.js'

expectTypeOf(MediaQuery.init).parameter(0).toEqualTypeOf<{ readonly query: string }>()
expectTypeOf(MediaQuery.with({ query: 'x' }).init)
  .parameter(0)
  .toBeVoid()
// @ts-expect-error: a preset's args are checked against the Schema's type
MediaQuery.with({ query: 1 })
