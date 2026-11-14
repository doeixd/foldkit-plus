/**
 * `Presence` as a Behavior: draws a phase the Model already holds. A row that
 * is leaving is `inert` for the whole exit, so it takes no click, Tab or
 * focus and leaves the accessibility tree, while it stays drawn for its
 * animation. It sends no Message and mounts nothing: the phase and the timed
 * `Hidden` fact belong to the `Presence` bundle (`foldkit-primitives/motion`),
 * and focus leaves the row through `FocusRecovery`, which observes `inert`.
 */
import type { Attribute, HtmlBuilder } from 'foldkit/html'
import { Behavior, SlotView, type SlotItem } from 'foldkit-mixins'
import type { PresenceModel } from '../motion/presence.js'

export { Presence as bundle, isVisible } from '../motion/presence.js'

/** `shown`, `hiding` or `hidden`: what `Presence`'s Model holds in `phase`. */
export type Phase = PresenceModel['phase']

export interface BehaviorOptions<Slots, Input> {
  /** The slot of the content that may leave: one per row, or the one popup. */
  readonly content: keyof Slots & string
  /**
   * The phase to draw. A slot drawn per item (`attrs(…, { index, id })`) is
   * given its item; a slot drawn once is given none.
   */
  readonly phase: (input: Input, item: SlotItem | undefined) => Phase
}

/**
 * Draws `data-presence` with the phase and `inert` for every phase but
 * `shown`. It is not `aria-hidden`, which would leave focus inside, nor
 * `hidden`, which would end the exit animation. Drawn by the view, so a server
 * render has both: a row that is `shown` has no `inert`.
 */
export function behavior<Slots, Input, ParentMessage>(
  bound: SlotView.Bound<Slots, Input, ParentMessage>,
): (options: BehaviorOptions<Slots, Input>) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(
  slots: SlotView.Unbound<Slots>,
): <Input, ParentMessage>(
  options: BehaviorOptions<Slots, Input>,
) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
  const slots = SlotView.boundSlots(given)
  return <Input, ParentMessage>(
    options: BehaviorOptions<Slots, Input>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.content]: Behavior.slot({
          attributes: ({
            input,
            h,
            item,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
            readonly item?: SlotItem
          }): ReadonlyArray<Attribute<ParentMessage>> => {
            const phase = options.phase(input, item)
            // Drawn false when shown, not left out: a property a later frame
            // stops writing is not reset by the patch.
            return [h.DataAttribute('presence', phase), h.Inert(phase !== 'shown')]
          },
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Presence' },
    )
}
