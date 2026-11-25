import type { StoreCapabilities } from 'metakit/store'
import { expectTypeOf } from 'vitest'
import type { JournalStore } from '../src/journal.js'

// Phase 5 Bout 5.1: hold `foldkit-durable`'s `JournalStore` equal to `metakit/store`'s `StoreCapabilities`.
expectTypeOf<JournalStore>().toEqualTypeOf<StoreCapabilities>()
