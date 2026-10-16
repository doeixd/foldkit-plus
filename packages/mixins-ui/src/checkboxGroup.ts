import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { flipped } from './choices.js'
import type { MixinList } from './resolve.js'

/**
 * A group of checkboxes for one question, as Zag's checkbox group: a
 * `fieldset` named by its `legend`, and a row per option with the APG's
 * checkbox (a button with `role="checkbox"` and `aria-checked`, which Space
 * presses) named by a `label` for it, so a press on the words toggles it too.
 * The checked values are the application's: the view draws `checked` and
 * sends `onToggle`, and `toggled` is the transition `update` applies.
 * `checkbox` and `label` take the same contract as the Checkbox's, so its
 * recipe's pieces style them.
 */
export const CheckboxGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  legend: Slot.make({ capability: Capability.Container }),
  option: Slot.make({ capability: Capability.Container }),
  checkbox: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaDisabled, Attr.Disabled],
  }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  /** The rows, apart from the legend and the error, so a row can sit beside its neighbours. */
  options: Slot.make({ capability: Capability.Container }),
  error: Slot.make({ capability: Capability.Container }),
})

export interface CheckboxGroupOption<Value extends string> {
  readonly value: Value
  readonly label: string
  readonly description?: string | undefined
  readonly disabled?: boolean | undefined
}

export interface CheckboxGroupView<Value extends string, Message> {
  /** What the options answer, the group's accessible name. */
  readonly legend: string
  readonly options: ReadonlyArray<CheckboxGroupOption<Value>>
  /** The checked values, as the application keeps them. */
  readonly checked: ReadonlyArray<Value>
  /** The Message a press on an option sends; its type comes from `h`. */
  readonly onToggle: (value: Value) => NoInfer<Message>
  /** Prefixes every id the group draws, unique on the page. */
  readonly id: string
  /** A style of `CheckboxGroupSlots`, for the group's look. */
  readonly style?: NamedStyle<typeof CheckboxGroupSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
  /** Shown under the options, and the group is `aria-invalid`. */
  readonly error?: string | undefined
}

const enabled = <Value extends string>(
  options: ReadonlyArray<CheckboxGroupOption<Value>>,
): ReadonlyArray<Value> =>
  options.flatMap(option => (option.disabled === true ? [] : [option.value]))

/**
 * `all` when every option that can be checked is, `none` when none are, and
 * `some` between. A disabled option counts for neither.
 */
export const coverage = <Value extends string>(
  options: ReadonlyArray<CheckboxGroupOption<Value>>,
  checked: ReadonlyArray<Value>,
): 'none' | 'some' | 'all' => {
  const values = enabled(options)
  const on = values.filter(value => checked.includes(value)).length
  if (on === 0 || values.length === 0) return 'none'
  return on === values.length ? 'all' : 'some'
}

/** Every option that can be checked, or none of them. */
export const setEnabled = <Value extends string>(
  options: ReadonlyArray<CheckboxGroupOption<Value>>,
  on: boolean,
): ReadonlyArray<Value> => (on ? enabled(options) : [])

/** The checked values after `value` is pressed: on if it was off, off if it was on. */
export const toggled = <Value extends string>(
  checked: ReadonlyArray<Value>,
  value: Value,
): ReadonlyArray<Value> => flipped(checked, value)

export const view = <Value extends string, Message>(
  options: CheckboxGroupView<Value, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    CheckboxGroupSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const checked = new Set<string>(options.checked)
  const error = options.error
  const invalid = error !== undefined && error !== ''
  const errorId = `${options.id}-error`
  return h.fieldset(
    builders.root.attrs(invalid ? [h.AriaInvalid(true), h.AriaDescribedBy(errorId)] : []),
    [
      h.legend(builders.legend.attrs(), [options.legend]),
      h.div(
        builders.options.attrs(),
        options.options.map(option => {
          const on = checked.has(option.value)
          const checkboxId = `${options.id}-${option.value}`
          const descriptionId = `${checkboxId}-description`
          const disabled = option.disabled === true
          return h.keyed('div')(
            option.value,
            builders.option.attrs([h.DataAttribute('checked', String(on))]),
            [
              h.button(
                builders.checkbox.attrs([
                  h.Type('button'),
                  h.Id(checkboxId),
                  h.Role('checkbox'),
                  h.AriaChecked(on),
                  ...(option.description === undefined ? [] : [h.AriaDescribedBy(descriptionId)]),
                  ...(disabled
                    ? [h.Disabled(true), h.AriaDisabled(true)]
                    : [h.OnClick(options.onToggle(option.value))]),
                ]),
                [],
              ),
              h.label(builders.label.attrs([h.For(checkboxId)]), [option.label]),
              ...(option.description === undefined
                ? []
                : [h.p(builders.description.attrs([h.Id(descriptionId)]), [option.description])]),
            ],
          )
        }),
      ),
      ...(invalid ? [h.p(builders.error.attrs([h.Id(errorId)]), [error])] : []),
    ],
  )
}
