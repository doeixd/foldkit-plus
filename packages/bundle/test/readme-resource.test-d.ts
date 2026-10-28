/**
 * The README's "Services that load on demand" section, type-checked. The
 * chunk's import is a declared function here, standing for `import('./payments.js')`.
 */
import { Context, Effect, Layer, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { expectTypeOf } from 'vitest'
import { Resource } from '../src/index.js'

const Message = defineMessageUnion({ Paid: { receipt: Schema.String }, FailedToPay: {} })

class Payments extends Context.Service<
  Payments,
  { readonly charge: (cents: number) => Effect.Effect<string> }
>()('app/Payments') {}

const Pay = Command.define('Pay', {
  args: { cents: Schema.Number },
  messages: [Message.Paid, Message.FailedToPay],
  execute: ({ cents }) =>
    Effect.gen(function* () {
      const payments = yield* Resource.get(Payments)
      return Message.Paid({ receipt: yield* payments.charge(cents) })
    }).pipe(Effect.catchTag('ResourceLoadError', () => Effect.succeed(Message.FailedToPay()))),
})

// payments.ts
export const layer = Layer.succeed(Payments, { charge: cents => Effect.succeed(`paid ${cents}`) })

declare const importPayments: () => Promise<{ readonly layer: typeof layer }>

const resources = Resource.lazy(Payments, () => importPayments().then(chunk => chunk.layer))

// What the Command requires is what the entry provides.
expectTypeOf(Pay({ cents: 100 }).effect).toEqualTypeOf<
  Effect.Effect<typeof Message.Type, never, Resource.Lazy<Payments>>
>()
expectTypeOf(resources).toEqualTypeOf<Layer.Layer<Resource.Lazy<Payments>>>()
