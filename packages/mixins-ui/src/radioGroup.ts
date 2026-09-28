import type { OptionInfo, RenderInfo } from '@foldkit/ui/radioGroup'
import { Attr, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'

/**
 * RadioGroup is a Submodel: each published bundle is a `ChildAttribute` group
 * that carries the boundary's dispatcher. The resolver treats those as opaque
 * and preserves their identity, so spreading a resolved bundle into the
 * parent's markup keeps routing through the radio group's `toParentMessage`.
 *
 * The base installs `OnClick` on an enabled, non-readonly option's `option`
 * bundle, so a Behavior adding its own click handler is a conflict rather than
 * a second silent owner.
 */
export const RadioGroupSlots = Slots.define({
  group: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role],
  }),
  option: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.Disabled, Attr.AriaDisabled],
  }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  hiddenInput: Slot.make({
    capability: Capability.Base,
    attributes: [Attr.Value],
  }),
})

/** One option with the attached Mixins applied to its bundles. */
export type ResolvedRadioOption<Value extends string, Message> = Omit<
  OptionInfo<Value>,
  'option' | 'label' | 'description'
> & {
  readonly option: SlotAttributes<Message>
  readonly label: SlotAttributes<Message>
  readonly description: SlotAttributes<Message>
}

/** The radio group's bundles with the attached Mixins applied. */
export interface ResolvedRadioGroup<Value extends string, Message> {
  readonly group: SlotAttributes<Message>
  readonly options: ReadonlyArray<ResolvedRadioOption<Value, Message>>
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
    group: builders.group.attrs(render.group),
    options: render.options.map(option => ({
      ...option,
      option: builders.option.attrs(option.option),
      label: builders.label.attrs(option.label),
      description: builders.description.attrs(option.description),
    })),
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
