/**
 * `FocusVisible` as a Behavior over a placed `InputModality`: the target gets
 * `data-focus-visible` while the page is being driven by keyboard, so a
 * stylesheet can show a ring with `[data-focus-visible]:focus` and hide it
 * for pointer users. CSS `:focus-visible` does this without any of it; this
 * is for a design system that must decide in the Model.
 */
import type { HtmlBuilder } from 'foldkit/html'
import type { Declared } from 'foldkit-bundle'
import { Behavior, Capability, SlotView } from 'foldkit-mixins'
import { InputModality, type InputModalityModel } from '../events/input-modality.js'

export { InputModality as bundle, Modality, modalityOfKey } from '../events/input-modality.js'
export type { InputModalityModel as Model } from '../events/input-modality.js'

export interface BehaviorOptions<Slots> {
  readonly target: keyof Slots & string
}

export const behavior = <Field extends string>(declared: Declared<typeof InputModality, Field>) => {
  function place<Slots, Input extends { readonly [K in Field]: InputModalityModel }, ParentMessage>(
    bound: SlotView.Bound<Slots, Input, ParentMessage>,
  ): (options: BehaviorOptions<Slots>) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
  function place<Slots>(
    slots: SlotView.Unbound<Slots>,
  ): <Input extends { readonly [K in Field]: InputModalityModel }, ParentMessage>(
    options: BehaviorOptions<Slots>,
  ) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
  function place<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
    const slots = SlotView.boundSlots(given)
    return <Input extends { readonly [K in Field]: InputModalityModel }, ParentMessage>(
      options: BehaviorOptions<Slots>,
    ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
      Behavior.forSlots(slots)<Input, ParentMessage>(
        {
          [options.target]: Behavior.slot({
            requires: { capability: Capability.Focusable },
            attributes: ({
              input,
              h,
            }: {
              readonly input: Input
              readonly h: HtmlBuilder<ParentMessage>
            }) =>
              input[declared.field].modality === 'keyboard'
                ? [h.DataAttribute('focus-visible', 'true')]
                : [],
          }),
          // Keyed by a value the caller chose; `forSlots` checks the key exists.
        } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
        { name: 'FocusVisible' },
      )
  }
  return place
}
