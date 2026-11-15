/**
 * Press: pointer and keyboard activation of one element as one fact. A Mount
 * reports what the element saw (pointer down, up, cancel, key down, up,
 * click) with the detail Foldkit's declarative attributes do not carry; the
 * Bundle's `update` decides what counts as a press; the ghost click that
 * follows a touch is suppressed by a timed Command on Effect's clock, never
 * by a clock read in a handler. Activation is an OutMessage, `Pressed`, so
 * the placement must say what a press does.
 */
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { A11y, Behavior, Capability, SlotView } from 'foldkit-mixins'
import { BundleBehavior } from './bundle-behavior.js'

export const PointerType = Schema.Literals(['mouse', 'touch', 'pen', 'keyboard', 'virtual'])
export type PointerType = typeof PointerType.Type

/** The keys held when a press completed, as the pointer, key or click event reported them. */
export const Modifiers = Schema.Struct({
  shiftKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  metaKey: Schema.Boolean,
  altKey: Schema.Boolean,
})
export type Modifiers = typeof Modifiers.Type

export const Model = Schema.Struct({
  /** Down and not yet released or cancelled. For styling. */
  pressed: Schema.Boolean,
  /** The pointer that pressed, so another pointer's up cannot release it. */
  pointerId: Schema.NullOr(Schema.Number),
  /** Enter or Space is down. */
  key: Schema.NullOr(Schema.String),
  /** A click arriving before this generation's window ends is the ghost of a pointer press. */
  suppressing: Schema.NullOr(Schema.Number),
  generation: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  PointerDown: { pointerId: Schema.Number, button: Schema.Number, pointerType: Schema.String },
  PointerUp: { pointerId: Schema.Number, pointerType: Schema.String, modifiers: Modifiers },
  PointerCancelled: { pointerId: Schema.Number },
  KeyDown: { key: Schema.String, repeat: Schema.Boolean },
  KeyUp: { key: Schema.String, modifiers: Modifiers },
  /** The key went up on an element that had since disabled itself: the press ends, and activates nothing. */
  KeyCancelled: { key: Schema.String },
  /** `detail` is 0 for a click no pointer made: keyboard on a native control, or assistive technology. */
  Clicked: { detail: Schema.Number, modifiers: Modifiers },
  Unsuppressed: { generation: Schema.Number },
})
export type Message = typeof Message.Type

export const Pressed = Schema.TaggedStruct('Pressed', {
  pointerType: PointerType,
  /** Shift, Ctrl, Meta and Alt as the completing event reported them: a range or a toggle reads them. */
  modifiers: Modifiers,
})
export type Pressed = typeof Pressed.Type

export const Args = Schema.Struct({
  /** How long after a pointer press a `click` is taken for its ghost. */
  clickSuppressionMs: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(0)),
    Schema.check(Schema.isFinite()),
  ),
})
export type Args = typeof Args.Type

const idle = (model: Model): Model => ({ ...model, pressed: false, pointerId: null, key: null })

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' '

const asPointerType = (raw: string): PointerType =>
  raw === 'touch' || raw === 'pen' ? raw : 'mouse'

type Return = Update.ReturnWithOutMessage<Model, Message, Pressed>

export const bundle = Bundle.make('Press', {
  Model,
  Message,
  args: Args,
  init: () => ({
    model: { pressed: false, pointerId: null, key: null, suppressing: null, generation: 0 },
  }),
  update: (model, message, args): Return =>
    Message.match<Return>(message, {
      PointerDown: ({ pointerId, button }) =>
        button !== 0 || model.pointerId !== null
          ? { model }
          : { model: { ...model, pressed: true, pointerId } },
      PointerUp: ({ pointerId, pointerType, modifiers }) => {
        if (model.pointerId !== pointerId) return { model }
        const generation = model.generation + 1
        return {
          model: { ...idle(model), suppressing: generation, generation },
          commands: [
            {
              name: 'Press.unsuppress',
              args: { generation },
              effect: Effect.as(
                Effect.sleep(args.clickSuppressionMs),
                Message.Unsuppressed({ generation }),
              ),
            },
          ],
          outMessage: Pressed.make({ pointerType: asPointerType(pointerType), modifiers }),
        }
      },
      PointerCancelled: ({ pointerId }) =>
        model.pointerId === pointerId ? { model: idle(model) } : { model },
      KeyDown: ({ key, repeat }) =>
        !isActivationKey(key) || repeat || model.key !== null || model.pointerId !== null
          ? { model }
          : { model: { ...model, pressed: true, key } },
      KeyUp: ({ key, modifiers }) =>
        model.key === key
          ? { model: idle(model), outMessage: Pressed.make({ pointerType: 'keyboard', modifiers }) }
          : { model },
      KeyCancelled: ({ key }) => (model.key === key ? { model: idle(model) } : { model }),
      Clicked: ({ detail, modifiers }) =>
        detail === 0
          ? { model, outMessage: Pressed.make({ pointerType: 'virtual', modifiers }) }
          : model.suppressing !== null
            ? { model }
            : { model, outMessage: Pressed.make({ pointerType: 'mouse', modifiers }) },
      Unsuppressed: ({ generation }) =>
        model.suppressing === generation ? { model: { ...model, suppressing: null } } : { model },
    }),
})

type PointerLike = Event & {
  readonly pointerId?: number
  readonly button?: number
  readonly pointerType?: string
}

/** A test's plain `Event` carries none of these, so each reads as not held. */
const modifiersOf = (event: Event): Modifiers => {
  const held = event as Partial<Modifiers>
  return {
    shiftKey: held.shiftKey ?? false,
    ctrlKey: held.ctrlKey ?? false,
    metaKey: held.metaKey ?? false,
    altKey: held.altKey ?? false,
  }
}

/** What the element reports; `Unsuppressed` comes from the timer, not the DOM. */
export type Fact = Exclude<Message, { readonly _tag: 'Unsuppressed' }>

/**
 * The element's press-relevant events as facts. Enter and Space key downs
 * are default-prevented so a native control does not also click, and Space
 * does not scroll; the Bundle owns activation. An element marked
 * `aria-disabled="true"` (which the Behavior writes) refuses new presses, read
 * at event time so a toggle needs no remount. A press that began while it was
 * enabled still ends: a release or a key up after it disabled is reported as a
 * cancel, so a stepper that disables itself at its bound mid-hold is not left
 * held. Nothing else is decided here.
 */
export const events = Mount.defineStream('PressEvents', {
  messages: [
    Message.PointerDown,
    Message.PointerUp,
    Message.PointerCancelled,
    Message.KeyDown,
    Message.KeyUp,
    Message.KeyCancelled,
    Message.Clicked,
  ],
  execute: ({ element }) =>
    Stream.callback<Fact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const isDisabled = () => element.getAttribute('aria-disabled') === 'true'
          const offer = (message: Fact) => Queue.offerUnsafe(queue, message)
          // What began while enabled, which is what disabling must not strand.
          let began: Option.Option<number> = Option.none()
          let beganKey: Option.Option<string> = Option.none()
          const pointerEnds = (id: number, whenEnabled: Fact) => {
            const ending = Option.contains(began, id)
            if (ending) began = Option.none()
            if (ending && isDisabled()) offer(Message.PointerCancelled({ pointerId: id }))
            else if (!isDisabled()) offer(whenEnabled)
          }
          const listeners: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            [
              'pointerdown',
              event => {
                if (isDisabled()) return
                const pointer = event as PointerLike
                const pointerId = pointer.pointerId ?? 0
                began = Option.some(pointerId)
                offer(
                  Message.PointerDown({
                    pointerId,
                    button: pointer.button ?? 0,
                    pointerType: pointer.pointerType ?? 'mouse',
                  }),
                )
              },
            ],
            [
              'pointerup',
              event => {
                const pointer = event as PointerLike
                const pointerId = pointer.pointerId ?? 0
                pointerEnds(
                  pointerId,
                  Message.PointerUp({
                    pointerId,
                    pointerType: pointer.pointerType ?? 'mouse',
                    modifiers: modifiersOf(event),
                  }),
                )
              },
            ],
            ...['pointerleave', 'pointercancel'].map(
              (type): readonly [string, (event: Event) => void] => [
                type,
                event => {
                  const pointerId = (event as PointerLike).pointerId ?? 0
                  pointerEnds(pointerId, Message.PointerCancelled({ pointerId }))
                },
              ],
            ),
            [
              'keydown',
              event => {
                const key = event as KeyboardEvent
                if (isActivationKey(key.key)) key.preventDefault()
                if (isDisabled()) return
                if (isActivationKey(key.key) && !key.repeat && Option.isNone(beganKey)) {
                  beganKey = Option.some(key.key)
                }
                offer(Message.KeyDown({ key: key.key, repeat: key.repeat }))
              },
            ],
            [
              'keyup',
              event => {
                const key = event as KeyboardEvent
                const ending = Option.contains(beganKey, key.key)
                if (ending) beganKey = Option.none()
                if (ending && isDisabled()) offer(Message.KeyCancelled({ key: key.key }))
                else if (!isDisabled())
                  offer(Message.KeyUp({ key: key.key, modifiers: modifiersOf(event) }))
              },
            ],
            [
              'click',
              event => {
                if (isDisabled()) return
                const click = event as MouseEvent
                offer(Message.Clicked({ detail: click.detail ?? 0, modifiers: modifiersOf(event) }))
              },
            ],
          ]
          for (const [type, listener] of listeners) element.addEventListener(type, listener)
          return listeners
        }),
        listeners =>
          Effect.sync(() => {
            for (const [type, listener] of listeners) element.removeEventListener(type, listener)
          }),
      ),
    ),
})

export interface BehaviorOptions<
  Input,
  Slots,
  Target extends keyof Slots & string = keyof Slots & string,
> {
  readonly target: Target
  /** Marks the target `aria-disabled`, which also silences its events. */
  readonly disabled?: (input: Input) => boolean
}

/**
 * Attaches the events Mount to the target slot, mapped into the placement's
 * Messages, and writes `data-pressed` while down for styling. The element
 * decides nothing; a click, a touch, Enter, Space, or an assistive
 * technology's click all reach `update` and come out as one `Pressed`.
 */
export const behavior = <Field extends string>(declared: Declared<typeof bundle, Field>) => {
  function place<Slots, Input extends { readonly [K in Field]: Model }, ParentMessage>(
    bound: SlotView.Bound<Slots, Input, ParentMessage>,
  ): <Target extends keyof Slots & string>(
    options: BehaviorOptions<Input, Slots, Target>,
  ) => Behavior.NamedBehavior<Slots, Input, ParentMessage, A11y.ProvidedOn<Target, 'activation'>>
  function place<Slots>(
    slots: SlotView.Unbound<Slots>,
  ): <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
  function place<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
    // `boundSlots` took a binder apart, so this is a slot set `fromBundle` accepts. `Unbound<Slots>`
    // is a conditional on a generic, which no plain `Slots` is known to satisfy: the cast is the
    // only way in without a second, unchecked entry on `fromBundle`.
    const slots = SlotView.boundSlots(given) as SlotView.Unbound<Slots>
    return <Input extends { readonly [K in Field]: Model }, ParentMessage>(
      options: BehaviorOptions<Input, Slots>,
    ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
      BundleBehavior.fromBundle(declared)<Slots>(slots)<Input, ParentMessage>(
        {
          [options.target]: {
            requires: { capability: Capability.Interactive },
            provides: [A11y.Activation],
            attributes: ({ input, h }) => [
              ...(input[declared.field].pressed ? [h.DataAttribute('pressed', 'true')] : []),
              ...(options.disabled?.(input) === true ? [h.AriaDisabled(true)] : []),
            ],
            events: events(),
          },
        },
        { name: 'Press' },
      )
  }
  return place
}
