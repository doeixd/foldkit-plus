/**
 * Debounced input as a bundle factory: `Changed` restarts a timer, and the
 * latest value settles as an OutMessage the placement must handle with
 * `onOut`. Each `Changed` bumps a generation carried by the `Settled` fact
 * it schedules, so a superseded timer's fact emits nothing — the same guard
 * as Presence's exit timeout. Generic over the value Schema, like History.
 * The clock is Effect's, so tests drive it with TestClock.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

export const debounce = <const Name extends string, Value>(config: {
  readonly name: Name
  readonly value: Schema.Codec<Value, unknown>
}) => {
  const Model = Schema.Struct({
    latest: Schema.NullOr(config.value),
    generation: Schema.Number,
  })
  type Model = typeof Model.Type

  const Message = defineMessageUnion({
    Changed: { value: config.value },
    Settled: { value: config.value, generation: Schema.Number },
  })
  type Message = typeof Message.Type

  const Debounced = Schema.TaggedStruct('Debounced', { value: config.value })
  type Debounced = typeof Debounced.Type

  const bundle = Bundle.make(config.name, {
    Model,
    Message,
    args: Schema.Struct({
      delayMs: Schema.Number.pipe(
        Schema.check(Schema.isGreaterThan(0)),
        Schema.check(Schema.isFinite()),
      ),
    }),
    init: () => ({ model: { latest: null, generation: 0 } }),
    update: (model, message, args) =>
      Message.match<Update.ReturnWithOutMessage<Model, Message, Debounced>>(message, {
        Changed: ({ value }) => {
          const generation = model.generation + 1
          return {
            model: { latest: value, generation },
            commands: [
              {
                name: `${config.name}.settle`,
                args: { generation },
                effect: Effect.as(
                  Effect.sleep(args.delayMs),
                  Message.Settled({ value, generation }),
                ),
              },
            ],
          }
        },
        // A superseded timer's fact arrives with an old generation: no
        // OutMessage, so the placement never sees it.
        Settled: ({ generation, value }) =>
          generation === model.generation
            ? { model, outMessage: Debounced.make({ value }) }
            : { model },
      }),
  })

  return Object.assign(bundle, { Message, Debounced })
}
