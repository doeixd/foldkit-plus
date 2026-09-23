/**
 * A two-state control's state in ARIA: `aria-checked` for a checkbox, switch,
 * radio or option, `aria-pressed` for a toggle button. The state is the
 * parent's. A native checkbox, radio or switch needs none of this; a radio
 * group's exclusivity is a selection, not a toggle.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Behavior from '../behavior.js'
import * as Capability from '../capability.js'

export type State = boolean | 'mixed'

export interface Options<Input, Slots> {
  readonly control: keyof Slots & string
  readonly state: (input: Input) => State
  /** `'checked'` writes `aria-checked` (checkbox, switch, radio, option);
   *  `'pressed'` writes `aria-pressed` (a toggle button). */
  readonly as: 'checked' | 'pressed'
}

export const behavior =
  <Slots>(slots: Slots) =>
  <Input, Message>(options: Options<Input, Slots>): Behavior.NamedBehavior<Slots, Input, Message> =>
    Behavior.forSlots(slots)<Input, Message>(
      {
        [options.control]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<Message>
          }) => {
            const state = options.state(input)
            return options.as === 'checked'
              ? [h.AriaChecked(state)]
              : [h.AriaPressed(state === 'mixed' ? 'mixed' : state ? 'true' : 'false')]
          },
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'ToggleState' },
    )
