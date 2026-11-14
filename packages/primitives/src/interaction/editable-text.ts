/**
 * `EditableText` as a Behavior: attaches the `foldkit-primitives/dom` Mount to
 * a container slot and maps what it reports into the view's Messages. No
 * Bundle: the text typed is a fact, and what it changes is the parent's
 * `update`.
 */
import * as Mount from 'foldkit/mount'
import { Behavior, Capability, SlotView } from 'foldkit-mixins'
import { EditableText as EditableTextMount, type TextFact } from '../dom/editable-text.js'

export {
  EditAsked,
  EditableText as mount,
  TextCancelled,
  TextCommitted,
  TextEdited,
  textOf,
  type TextFact,
} from '../dom/editable-text.js'

export interface BehaviorOptions<Slots, ParentMessage> {
  /** The slot holding the fields. */
  readonly container: keyof Slots & string
  /** The attribute that marks a field, holding its name. */
  readonly attribute: string
  /** Turns each fact into the view's Message. */
  readonly toMessage: (fact: TextFact) => ParentMessage
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
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: () =>
            Mount.mapMessage(
              EditableTextMount({ attribute: options.attribute }),
              options.toMessage,
            ),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'EditableText' },
    )
}
