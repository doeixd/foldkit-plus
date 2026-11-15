/**
 * Repeat: a held stepper. Pressing steps once, and holding on steps again every
 * `intervalMs` after `delayMs`, until the press ends or the parent says the
 * bound is reached. It reads the facts `Press.events` reports; the clock is a
 * Command on Effect's clock carrying a generation, so a release makes a late
 * `Elapsed` a no-op. A mouse or a key steps as it goes down; a finger or a pen
 * steps on release (a tap) or once held, so a scroll that starts on the button
 * never steps; a click no pointer made (a screen reader's) steps once. `Stepped`
 * and `Ended` are OutMessages the placement must handle.
 */
import { Effect, Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Capability } from 'foldkit-mixins'
import * as Press from './press.js'

export const Model = Schema.Struct({
  /** Down, and the press has not ended. */
  holding: Schema.Boolean,
  pointerId: Schema.OptionFromNullOr(Schema.Number),
  key: Schema.OptionFromNullOr(Schema.String),
  input: Press.PointerType,
  /** Steps this press has made. */
  count: Schema.Number,
  /** The parent said the bound is reached: the rest of this press steps no more. */
  stopped: Schema.Boolean,
  generation: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  PointerDown: { pointerId: Schema.Number, button: Schema.Number, pointerType: Schema.String },
  PointerUp: { pointerId: Schema.Number, pointerType: Schema.String, shiftKey: Schema.Boolean },
  PointerCancelled: { pointerId: Schema.Number },
  KeyDown: { key: Schema.String, repeat: Schema.Boolean },
  KeyUp: { key: Schema.String, shiftKey: Schema.Boolean },
  KeyCancelled: { key: Schema.String },
  Clicked: { detail: Schema.Number, shiftKey: Schema.Boolean },
  Elapsed: { generation: Schema.Number },
  /** The parent reached a bound (a stepper's maximum): a held press steps no more. */
  Stopped: {},
})
export type Message = typeof Message.Type

export const Stepped = Schema.TaggedStruct('Stepped', {
  /** Which step of this press, from 1; a click no pointer made is always 1. */
  count: Schema.Number,
  input: Press.PointerType,
})
export type Stepped = typeof Stepped.Type

/** A hold's steps ended, after `count` of them. A single step (a tap, a click) has no end of its own. */
export const Ended = Schema.TaggedStruct('Ended', { count: Schema.Number })
export type Ended = typeof Ended.Type

export type Out = Stepped | Ended

const positive = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThan(0)),
  Schema.check(Schema.isFinite()),
)

export const Args = Schema.Struct({
  /** How long a press lasts before it starts repeating. */
  delayMs: positive,
  /** How often it steps again while held. */
  intervalMs: positive,
})
export type Args = typeof Args.Type

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' '

const pointerOf = (raw: string): Press.PointerType =>
  raw === 'touch' || raw === 'pen' ? raw : 'mouse'

const isFinger = (input: Press.PointerType): boolean => input === 'touch' || input === 'pen'

const idle = (model: Model): Model => ({
  ...model,
  holding: false,
  pointerId: Option.none(),
  key: Option.none(),
})

type Return = Update.ReturnWithOutMessage<Model, Message, Out>

const after = (ms: number, generation: number) => ({
  name: 'Repeat.elapse',
  args: { generation },
  effect: Effect.as(Effect.sleep(ms), Message.Elapsed({ generation })),
})

const step = (model: Model): { readonly model: Model; readonly out: Stepped } => {
  const count = model.count + 1
  return { model: { ...model, count }, out: Stepped.make({ count, input: model.input }) }
}

const begin = (
  model: Model,
  args: Args,
  by: { readonly pointerId: number } | { readonly key: string },
  input: Press.PointerType,
): Return => {
  const generation = model.generation + 1
  const started: Model = {
    holding: true,
    pointerId: 'pointerId' in by ? Option.some(by.pointerId) : Option.none(),
    key: 'key' in by ? Option.some(by.key) : Option.none(),
    input,
    count: 0,
    stopped: false,
    generation,
  }
  // A mouse or a key steps as it goes down; a finger waits to tell a tap from a scroll or a hold.
  if (isFinger(input)) return { model: started, commands: [after(args.delayMs, generation)] }
  const first = step(started)
  return { model: first.model, commands: [after(args.delayMs, generation)], outMessage: first.out }
}

const release = (model: Model): Return =>
  model.count > 0
    ? { model: idle(model), outMessage: Ended.make({ count: model.count }) }
    : { model: idle(model) }

export const bundle = Bundle.make('Repeat', {
  Model,
  Message,
  args: Args,
  init: () => ({
    model: {
      holding: false,
      pointerId: Option.none(),
      key: Option.none(),
      input: 'mouse',
      count: 0,
      stopped: false,
      generation: 0,
    },
  }),
  update: (model, message, args): Return =>
    Message.match<Return>(message, {
      PointerDown: ({ pointerId, button, pointerType }) =>
        button !== 0 || model.holding
          ? { model }
          : begin(model, args, { pointerId }, pointerOf(pointerType)),
      PointerUp: ({ pointerId }) => {
        if (!Option.contains(model.pointerId, pointerId)) return { model }
        // A finger that lifted before the hold began tapped: one step.
        if (model.count === 0 && isFinger(model.input) && !model.stopped) {
          const tapped = step(model)
          return { model: idle(tapped.model), outMessage: tapped.out }
        }
        return release(model)
      },
      PointerCancelled: ({ pointerId }) =>
        Option.contains(model.pointerId, pointerId) ? release(model) : { model },
      // The browser's repeats of a held key arrive while holding, which already ignores them.
      KeyDown: ({ key }) =>
        !isActivationKey(key) || model.holding
          ? { model }
          : begin(model, args, { key }, 'keyboard'),
      KeyUp: ({ key }) => (Option.contains(model.key, key) ? release(model) : { model }),
      KeyCancelled: ({ key }) => (Option.contains(model.key, key) ? release(model) : { model }),
      // The click after a pointer press has a detail; one with none is no pointer's (assistive technology).
      Clicked: ({ detail }) =>
        detail === 0 && !model.holding
          ? { model, outMessage: Stepped.make({ count: 1, input: 'virtual' }) }
          : { model },
      Elapsed: ({ generation }) => {
        if (!model.holding || model.generation !== generation || model.stopped) return { model }
        const stepped = step(model)
        return {
          model: stepped.model,
          commands: [after(args.intervalMs, generation)],
          outMessage: stepped.out,
        }
      },
      Stopped: () =>
        model.holding && !model.stopped ? { model: { ...model, stopped: true } } : { model },
    }),
})

export interface BehaviorOptions<Slots> {
  readonly target: keyof Slots & string
}

/**
 * Attaches `Press.events` to the target, mapped into this placement's
 * Messages, and writes `data-holding` while the press is down. `Press`,
 * `LongPress` and `Repeat` on one slot are refused by the resolver (two Mounts
 * of one name), so a slot takes one of them.
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
      { name: 'Repeat' },
    )
