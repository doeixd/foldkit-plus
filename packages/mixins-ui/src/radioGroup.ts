import type { OptionInfo, RenderInfo } from '@foldkit/ui/radioGroup'
import type { SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'
import { RadioGroupSlots } from './radioGroup/slots.js'

export { RadioGroupSlots } from './radioGroup/slots.js'
export { readingKeys } from './radioGroup/readingKeys.js'
export {
  configure,
  view,
  type RadioGroupPreset,
  type RadioGroupRow,
  type RadioGroupView,
} from './radioGroup/view.js'

/** One option with the attached Mixins applied to its bundles. */
export type ResolvedRadioOption<Value extends string, Message> = Omit<
  OptionInfo<Value>,
  'option' | 'label' | 'description'
> & {
  readonly option: SlotAttributes<Message>
  readonly label: SlotAttributes<Message>
  readonly description: SlotAttributes<Message>
  readonly card: SlotAttributes<Message>
  readonly text: SlotAttributes<Message>
  readonly icon: SlotAttributes<Message>
  readonly trailing: SlotAttributes<Message>
}

/** The radio group's bundles with the attached Mixins applied. */
export interface ResolvedRadioGroup<Value extends string, Message> {
  /** The element around the legend, the group and the error, which `RadioGroup.view` draws. */
  readonly root: SlotAttributes<Message>
  readonly legend: SlotAttributes<Message>
  readonly group: SlotAttributes<Message>
  readonly options: ReadonlyArray<ResolvedRadioOption<Value, Message>>
  readonly error: SlotAttributes<Message>
  readonly selectedValue: RenderInfo<Value>['selectedValue']
  readonly hiddenInput: SlotAttributes<Message>
}

/** Resolves every option's bundles alongside the group and hidden input. */
export const resolve = <Value extends string, Input, Message>(
  render: RenderInfo<Value>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedRadioGroup<Value, Message> => {
  const builders = buildersOf(RadioGroupSlots, mixins, context)
  return {
    root: builders.root.attrs(),
    legend: builders.legend.attrs(),
    group: builders.group.attrs(render.group),
    options: render.options.map(option => ({
      ...option,
      option: builders.option.attrs(option.option),
      label: builders.label.attrs(option.label),
      description: builders.description.attrs(option.description),
      card: builders.card.attrs([context.h.DataAttribute('checked', String(option.isSelected))]),
      text: builders.text.attrs(),
      icon: builders.icon.attrs(),
      trailing: builders.trailing.attrs(),
    })),
    error: builders.error.attrs(),
    selectedValue: render.selectedValue,
    hiddenInput: builders.hiddenInput.attrs(render.hiddenInput),
  }
}

/** The radio group's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Value extends string, Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedRadioGroup<Value, Message>) => Html,
  ) =>
  (render: RenderInfo<Value>): Html =>
    draw(resolve(render, mixins, context))
