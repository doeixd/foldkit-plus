/**
 * LongPress: holding an element down for `thresholdMs` is one fact. It reads
 * the same facts `Press.events` reports; the threshold is a Command on
 * Effect's clock carrying a generation, so a release before it fires makes
 * its `Elapsed` a no-op. `LongPressed` is an OutMessage the placement must
 * handle. A short press is `Press`'s business, not this Bundle's.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Capability } from 'foldkit-mixins'
import * as Press from './press.js'

export const Model = Schema.Struct({
  /** Down, and the threshold has not passed. */
  holding: Schema.Boolean,
  pointerId: Schema.NullOr(Schema.Number),
  key: Schema.NullOr(Schema.String),
  generation: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  PointerDown: { pointerId: Schema.Number, button: Schema.Number, pointerType: Schema.String },
  PointerUp: { pointerId: Schema.Number, pointerType: Schema.String },
  PointerCancelled: { pointerId: Schema.Number },
  KeyDown: { key: Schema.String, repeat: Schema.Boolean },
  KeyUp: { key: Schema.String },
  Clicked: { detail: Schema.Number },
  Elapsed: { generation: Schema.Number, pointerType: Press.PointerType },
})
export type Message = typeof Message.Type

export const LongPressed = Schema.TaggedStruct('LongPressed', { pointerType: Press.PointerType })
export type LongPressed = typeof LongPressed.Type

export const Args = Schema.Struct({
  thresholdMs: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThan(0)),
    Schema.check(Schema.isFinite()),
  ),
})
export type Args = typeof Args.Type

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' '

const released = (model: Model): Model => ({ ...model, holding: false, pointerId: null, key: null })

type Return = Update.ReturnWithOutMessage<Model, Message, LongPressed>

const start = (
  model: Model,
  args: Args,
  by: { readonly pointerId: number } | { readonly key: string },
  pointerType: Press.PointerType,
): Return => {
  const generation = model.generation + 1
  return {
    model: {
      holding: true,
      pointerId: 'pointerId' in by ? by.pointerId : null,
      key: 'key' in by ? by.key : null,
      generation,
    },
    commands: [
      {
        name: 'LongPress.elapse',
        args: { generation },
        effect: Effect.as(
          Effect.sleep(args.thresholdMs),
          Message.Elapsed({ generation, pointerType }),
        ),
      },
    ],
  }
}

export const bundle = Bundle.make('LongPress', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { holding: false, pointerId: null, key: null, generation: 0 } }),
  update: (model, message, args): Return =>
    Message.match<Return>(message, {
      PointerDown: ({ pointerId, button, pointerType }) =>
        button !== 0 || model.holding
          ? { model }
          : start(
              model,
              args,
              { pointerId },
              pointerType === 'touch' || pointerType === 'pen' ? pointerType : 'mouse',
            ),
      PointerUp: ({ pointerId }) =>
        model.pointerId === pointerId ? { model: released(model) } : { model },
      PointerCancelled: ({ pointerId }) =>
        model.pointerId === pointerId ? { model: released(model) } : { model },
      KeyDown: ({ key, repeat }) =>
        !isActivationKey(key) || repeat || model.holding
          ? { model }
          : start(model, args, { key }, 'keyboard'),
      KeyUp: ({ key }) => (model.key === key ? { model: released(model) } : { model }),
      Clicked: () => ({ model }),
      Elapsed: ({ generation, pointerType }) =>
        model.holding && model.generation === generation
          ? { model: released(model), outMessage: LongPressed.make({ pointerType }) }
          : { model },
    }),
})

export interface BehaviorOptions<Slots> {
  readonly target: keyof Slots & string
}

/**
 * Attaches `Press.events` to the target, mapped into this placement's
 * Messages, and writes `data-holding` while the element is down. `Press` and
 * `LongPress` on one slot are refused by the resolver (two Mounts of one
 * name), so today a slot takes one of them.
 */
export const behavior =
  <Field extends string>(declared: Declared<typeof bundle, Field>) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Slots>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.target]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
          }) => (input[declared.field].holding ? [h.DataAttribute('holding', 'true')] : []),
          mount: () =>
            Mount.mapMessage(
              Press.events(),
              // The facts are the same tagged structs; only the union differs.
              (fact): ParentMessage =>
                declared.wrapper.make(fact as unknown as Message) as unknown as ParentMessage,
            ),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'LongPress' },
    )
