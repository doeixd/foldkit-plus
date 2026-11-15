import type { OptionInfo, RenderInfo } from '@foldkit/ui/radioGroup'
import { Attr, Behavior, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { readingKey } from './direction.js'
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
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaInvalid],
  }),
  option: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [
      Attr.Role,
      Attr.AriaChecked,
      Attr.AriaLabelledby,
      Attr.Disabled,
      Attr.AriaDisabled,
    ],
  }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  /**
   * An option's whole row, which the application draws around its radio and
   * words (a `label`, so a press anywhere on it presses the radio). No
   * upstream bundle: this package's, `data-checked` while its option is, so
   * a card recipe styles the row and its chosen look.
   */
  card: Slot.make({ capability: Capability.Container }),
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
  readonly card: SlotAttributes<Message>
}

/** The radio group's bundles with the attached Mixins applied. */
export interface ResolvedRadioGroup<Value extends string, Message> {
  readonly group: SlotAttributes<Message>
  readonly options: ReadonlyArray<ResolvedRadioOption<Value, Message>>
  readonly selectedValue: RenderInfo<Value>['selectedValue']
  readonly hiddenInput: SlotAttributes<Message>
}

const forward = new Set(['ArrowRight', 'ArrowDown'])
const backward = new Set(['ArrowLeft', 'ArrowUp'])

/**
 * The key the group's own handler listens for, from the one pressed: both
 * pairs mean next and previous (the APG's radio group), whichever way the
 * group lies, and Left and Right swap under right to left. Upstream binds the
 * one pair of its orientation and knows no direction.
 */
const asOwnKey = (key: string, vertical: boolean, rtl: boolean): string => {
  const read = readingKey(key, rtl ? 'rtl' : 'ltr')
  if (forward.has(read)) return vertical ? 'ArrowDown' : 'ArrowRight'
  if (backward.has(read)) return vertical ? 'ArrowUp' : 'ArrowLeft'
  return key
}

const ArrowPairs = Mount.defineStream('RadioGroupArrowPairs', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // An `Element`'s listeners are typed for any event.
          const read = (event: Event) => {
            if (!(event instanceof KeyboardEvent)) return
            const key = asOwnKey(
              event.key,
              element.getAttribute('aria-orientation') === 'vertical',
              element.matches(':dir(rtl)'),
            )
            if (key !== event.key) Object.defineProperty(event, 'key', { value: key })
          }
          element.addEventListener('keydown', read, { capture: true })
          return () => element.removeEventListener('keydown', read, { capture: true })
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

/**
 * Arrow keys as the APG asks: Right and Down are both next, Left and Up both
 * previous, in a row or a column, and right to left swaps Left and Right.
 * Upstream's handler on each option binds one pair and knows no direction,
 * and no view option reaches it, so this is a Mount that rewrites the key
 * before that handler reads it: the one keydown owner stays the option's. Pass it beside
 * the style. It is not built in because a Scene test must resolve every
 * Mount with a Message, and this one has none to give.
 */
export const readingKeys = Behavior.forSlots(RadioGroupSlots)<unknown, never>(
  {
    group: Behavior.slot({
      requires: { capability: Capability.Container },
      mount: () => ArrowPairs(),
    }),
  },
  { name: 'RadioGroupReadingKeys' },
).mixin

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
      card: builders.card.attrs([context.h.DataAttribute('checked', String(option.isSelected))]),
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
