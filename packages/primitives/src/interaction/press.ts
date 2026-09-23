/**
 * Press: pointer and keyboard activation of one element as one fact. A Mount
 * reports what the element saw (pointer down, up, cancel, key down, up,
 * click) with the detail Foldkit's declarative attributes do not carry; the
 * Bundle's `update` decides what counts as a press; the ghost click that
 * follows a touch is suppressed by a timed Command on Effect's clock, never
 * by a clock read in a handler. Activation is an OutMessage, `Pressed`, so
 * the placement must say what a press does.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Capability } from 'foldkit-mixins'

export const PointerType = Schema.Literals(['mouse', 'touch', 'pen', 'keyboard', 'virtual'])
export type PointerType = typeof PointerType.Type

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
  PointerUp: { pointerId: Schema.Number, pointerType: Schema.String, shiftKey: Schema.Boolean },
  PointerCancelled: { pointerId: Schema.Number },
  KeyDown: { key: Schema.String, repeat: Schema.Boolean },
  KeyUp: { key: Schema.String, shiftKey: Schema.Boolean },
  /** `detail` is 0 for a click no pointer made: keyboard on a native control, or assistive technology. */
  Clicked: { detail: Schema.Number, shiftKey: Schema.Boolean },
  Unsuppressed: { generation: Schema.Number },
})
export type Message = typeof Message.Type

export const Pressed = Schema.TaggedStruct('Pressed', {
  pointerType: PointerType,
  /** Shift was held, for a range selection. */
  shiftKey: Schema.Boolean,
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
      PointerUp: ({ pointerId, pointerType, shiftKey }) => {
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
          outMessage: Pressed.make({ pointerType: asPointerType(pointerType), shiftKey }),
        }
      },
      PointerCancelled: ({ pointerId }) =>
        model.pointerId === pointerId ? { model: idle(model) } : { model },
      KeyDown: ({ key, repeat }) =>
        !isActivationKey(key) || repeat || model.key !== null || model.pointerId !== null
          ? { model }
          : { model: { ...model, pressed: true, key } },
      KeyUp: ({ key, shiftKey }) =>
        model.key === key
          ? { model: idle(model), outMessage: Pressed.make({ pointerType: 'keyboard', shiftKey }) }
          : { model },
      Clicked: ({ detail, shiftKey }) =>
        detail === 0
          ? { model, outMessage: Pressed.make({ pointerType: 'virtual', shiftKey }) }
          : model.suppressing !== null
            ? { model }
            : { model, outMessage: Pressed.make({ pointerType: 'mouse', shiftKey }) },
      Unsuppressed: ({ generation }) =>
        model.suppressing === generation ? { model: { ...model, suppressing: null } } : { model },
    }),
})

type PointerLike = Event & {
  readonly pointerId?: number
  readonly button?: number
  readonly pointerType?: string
  readonly shiftKey?: boolean
}

/** What the element reports; `Unsuppressed` comes from the timer, not the DOM. */
export type Fact = Exclude<Message, { readonly _tag: 'Unsuppressed' }>

/**
 * The element's press-relevant events as facts. Enter and Space key downs
 * are default-prevented so a native control does not also click, and Space
 * does not scroll; the Bundle owns activation. An element marked
 * `aria-disabled="true"` (which the Behavior writes) reports nothing, read
 * at event time so a toggle needs no remount. Nothing else is decided here.
 */
export const events = Mount.defineStream('PressEvents', {
  messages: [
    Message.PointerDown,
    Message.PointerUp,
    Message.PointerCancelled,
    Message.KeyDown,
    Message.KeyUp,
    Message.Clicked,
  ],
  execute: ({ element }) =>
    Stream.callback<Fact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const offer = (message: Fact) => {
            if (element.getAttribute('aria-disabled') === 'true') return
            Queue.offerUnsafe(queue, message)
          }
          const listeners: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            [
              'pointerdown',
              event => {
                const pointer = event as PointerLike
                offer(
                  Message.PointerDown({
                    pointerId: pointer.pointerId ?? 0,
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
                offer(
                  Message.PointerUp({
                    pointerId: pointer.pointerId ?? 0,
                    pointerType: pointer.pointerType ?? 'mouse',
                    shiftKey: pointer.shiftKey ?? false,
                  }),
                )
              },
            ],
            [
              'pointerleave',
              event =>
                offer(
                  Message.PointerCancelled({ pointerId: (event as PointerLike).pointerId ?? 0 }),
                ),
            ],
            [
              'pointercancel',
              event =>
                offer(
                  Message.PointerCancelled({ pointerId: (event as PointerLike).pointerId ?? 0 }),
                ),
            ],
            [
              'keydown',
              event => {
                const key = event as KeyboardEvent
                if (isActivationKey(key.key)) key.preventDefault()
                offer(Message.KeyDown({ key: key.key, repeat: key.repeat }))
              },
            ],
            [
              'keyup',
              event => {
                const key = event as KeyboardEvent
                offer(Message.KeyUp({ key: key.key, shiftKey: key.shiftKey }))
              },
            ],
            [
              'click',
              event => {
                const click = event as MouseEvent
                offer(
                  Message.Clicked({ detail: click.detail ?? 0, shiftKey: click.shiftKey ?? false }),
                )
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

export interface BehaviorOptions<Input, Slots> {
  readonly target: keyof Slots & string
  /** Marks the target `aria-disabled`, which also silences its events. */
  readonly disabled?: (input: Input) => boolean
}

/**
 * Attaches the events Mount to the target slot, mapped into the placement's
 * Messages, and writes `data-pressed` while down for styling. The element
 * decides nothing; a click, a touch, Enter, Space, or an assistive
 * technology's click all reach `update` and come out as one `Pressed`.
 */
export const behavior =
  <Field extends string>(declared: Declared<typeof bundle, Field>) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
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
          }) => [
            ...(input[declared.field].pressed ? [h.DataAttribute('pressed', 'true')] : []),
            ...(options.disabled?.(input) === true ? [h.AriaDisabled(true)] : []),
          ],
          mount: () =>
            Mount.mapMessage(
              events(),
              (message): ParentMessage =>
                declared.wrapper.make(message) as unknown as ParentMessage,
            ),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Press' },
    )
