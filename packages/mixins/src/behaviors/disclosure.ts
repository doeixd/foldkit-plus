/**
 * A trigger that shows and hides content: `aria-expanded` and `aria-controls`
 * on the trigger, an `id` and `hidden` on the content. The open flag is the
 * parent's; this only says it in ARIA. The floor is `<details>`, which needs
 * none of this.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Behavior from '../behavior.js'
import * as Capability from '../capability.js'
import { boundSlots, type Bound, type Unbound } from '../slotView.js'

export interface Options<Input, Slots> {
  readonly trigger: keyof Slots & string
  readonly content: keyof Slots & string
  readonly open: (input: Input) => boolean
  /** The content's id, which `aria-controls` names. */
  readonly id: (input: Input) => string
}

export function behavior<Slots, Input, Message>(
  bound: Bound<Slots, Input, Message>,
): (options: Options<Input, Slots>) => Behavior.NamedBehavior<Slots, Input, Message>
export function behavior<Slots>(
  slots: Unbound<Slots>,
): <Input, Message>(options: Options<Input, Slots>) => Behavior.NamedBehavior<Slots, Input, Message>
export function behavior<Slots>(given: Slots | Bound<Slots, any, any>) {
  const slots = boundSlots(given)
  return <Input, Message>(
    options: Options<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, Message> =>
    Behavior.forSlots(slots)<Input, Message>(
      {
        [options.trigger]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<Message>
          }) => [h.AriaExpanded(options.open(input)), h.AriaControls(options.id(input))],
        }),
        [options.content]: Behavior.slot({
          requires: { capability: Capability.Container },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<Message>
          }) => [h.Id(options.id(input)), h.Hidden(!options.open(input))],
        }),
        // Keyed by values the caller chose; `forSlots` checks both keys exist.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'Disclosure' },
    )
}
