/**
 * `Move` as a Behavior: attaches the `foldkit-primitives/dom` Mount to a
 * draggable slot and maps its facts into the view's Messages. No Bundle: a
 * drag's meaning (a threshold, a snap, a reorder) is the parent's `update`,
 * and the deltas are already facts.
 */
import * as Mount from 'foldkit/mount'
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, SlotView } from 'foldkit-mixins'
import { Move as MoveMount, type Fact } from '../dom/move.js'
import { Box } from '../state/index.js'

export { Move as mount, MoveEnded, MoveStarted, Moved, type Fact } from '../dom/move.js'

export interface BehaviorOptions<Slots, ParentMessage> {
  readonly handle: keyof Slots & string
  /** Turns each fact into the view's Message. */
  readonly toMessage: (fact: Fact) => ParentMessage
}

export function behavior<Slots, Input, ParentMessage>(
  bound: SlotView.Bound<Slots, Input, ParentMessage>,
): (
  options: BehaviorOptions<Slots, ParentMessage>,
) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(
  slots: SlotView.Unbound<Slots>,
): <Input, ParentMessage>(
  options: BehaviorOptions<Slots, ParentMessage>,
) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
  const slots = SlotView.boundSlots(given)
  return <Input, ParentMessage>(
    options: BehaviorOptions<Slots, ParentMessage>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.handle]: Behavior.slot({
          requires: { capability: Capability.Draggable },
          mount: () => Mount.mapMessage(MoveMount(), options.toMessage),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Move' },
    )
}

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const

/**
 * The keyboard's way to do what a drag does, as a `Behaviors.Keys` route for
 * the handle's keydown owner: Alt with an arrow asks for a nudge by `step`, and
 * Shift for `largeStep` (ten steps by default). `toMessage` receives the delta
 * for `update` to apply with `Box.moveBy` or `Box.moveEach`, so the limits are
 * the drag's, and to announce with `LiveAnnounce`. Plain arrows are left to the
 * page and the other routes.
 */
export const nudge = <Input, Message>(
  options: Box.KeyStep & { readonly toMessage: (delta: Box.Delta) => Message },
): Behaviors.Keys.Route<Input, Message> =>
  Behaviors.Keys.route('MoveNudge', {
    on: [
      Behaviors.Keys.chord('ArrowUp', { alt: true }),
      ...ARROWS.flatMap(key => Behaviors.Keys.withShift(key, { alt: true })).slice(1),
    ],
    handle: ({ key, modifiers }) =>
      Option.map(
        Box.moveKey(
          { key, repeat: false, ctrl: false, alt: true, meta: false, shift: modifiers.shiftKey },
          options,
        ),
        options.toMessage,
      ),
  })

/**
 * The same for a resize handle: arrows move the handle's own edges (Shift the
 * larger step), Home and End ask for the smallest and largest size, which
 * `Box.resize` clamps to its limits. A key the handle does not own (Up on an
 * east handle) is declined and untouched.
 */
export const resizeKeys = <Input, Message>(
  handle: Box.Handle,
  options: Box.KeyStep & { readonly toMessage: (delta: Box.Delta) => Message },
): Behaviors.Keys.Route<Input, Message> =>
  Behaviors.Keys.route('MoveResize', {
    on: [
      Behaviors.Keys.chord('Home'),
      Behaviors.Keys.chord('End'),
      ...ARROWS.flatMap(key => Behaviors.Keys.withShift(key)),
    ],
    handle: ({ key, modifiers }) =>
      Option.map(
        Box.resizeKey(
          { key, repeat: false, ctrl: false, alt: false, meta: false, shift: modifiers.shiftKey },
          handle,
          options,
        ),
        options.toMessage,
      ),
  })
