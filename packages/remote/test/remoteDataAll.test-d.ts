import type { Option } from 'effect'
import { expectTypeOf } from 'vitest'
import { RemoteData } from '../src/index.js'

declare const count: RemoteData<number>
declare const label: RemoteData<string>

const both = RemoteData.all({ count, label })
expectTypeOf(both).toEqualTypeOf<RemoteData<{ readonly count: number; readonly label: string }>>()

// The value types are read from each entry, not widened to a union of them.
expectTypeOf(RemoteData.held(both)).toEqualTypeOf<
  Option.Option<{ readonly count: number; readonly label: string }>
>()

// @ts-expect-error a bare value is not a RemoteData
RemoteData.all({ count, plain: 1 })

// @ts-expect-error an Option is not a RemoteData
RemoteData.all({ count, held: RemoteData.held(count) })

// @ts-expect-error `all` takes a struct, not a list
RemoteData.all([count, label])
