/**
 * The Checkbox drawn from options: `view` over a checked state the
 * application owns, and `configure`, the application's own Checkbox. A module
 * of its own beside the adapter (`../checkbox.ts`), which stays the rung for a
 * checkbox an application lays out itself.
 */
import * as UiCheckbox from '@foldkit/ui/checkbox'
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { toView } from '../checkbox.js'
import { layered, type PresetOption, type Presets } from '../configure.js'
import type { MixinList } from '../resolve.js'
import { toggleRow, type TogglePosition } from '../toggleRow.js'
import type { CheckboxSlots } from './slots.js'

export interface CheckboxView<Outer> {
  /** Prefixes the ids the checkbox draws, unique on the page. */
  readonly id: string
  /** The application's field. */
  readonly checked: boolean
  /** Sent with the state a press leaves. */
  readonly onToggle: (checked: boolean) => NoInfer<Outer>
  /** The checkbox's accessible name, drawn beside it. */
  readonly label: string
  /** A line under the label, which also describes the control. */
  readonly description?: string | undefined
  /** `end` puts the words before the control. Default `start`. */
  readonly position?: TogglePosition | undefined
  /** Drawn beside the label: a badge, a hint with a Tooltip. */
  readonly labelAside?: Html | undefined
  /** A dash: some of what this box stands for is chosen. */
  readonly indeterminate?: boolean | undefined
  readonly disabled?: boolean | undefined
  /** Shows the state and refuses a press. */
  readonly readOnly?: boolean | undefined
  /** The box shows the error edge and says so to a screen reader. */
  readonly invalid?: boolean | undefined
  /** Submitted under this name, as `value` while checked and empty otherwise. */
  readonly name?: string | undefined
  /** What a checked box submits. Default `on`. */
  readonly value?: string | undefined
  readonly style?: NamedStyle<typeof CheckboxSlots> | undefined
  readonly mixins?: MixinList<Outer> | undefined
}

export const view = <Outer>(options: CheckboxView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const {
    id,
    checked,
    label,
    description,
    labelAside,
    position = 'start',
    invalid = false,
    disabled = false,
  } = options
  const mixins = [
    ...(options.style === undefined ? [] : [options.style.mixin]),
    ...(options.mixins ?? []),
  ]
  return UiCheckbox.view(
    {
      id,
      isChecked: checked,
      onToggle: options.onToggle,
      isIndeterminate: options.indeterminate === true,
      isDisabled: disabled,
      isReadOnly: options.readOnly === true,
      hasDescription: description !== undefined,
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.value === undefined ? {} : { value: options.value }),
      toView: toView(mixins, { h }, resolved =>
        toggleRow(
          {
            slots: resolved,
            state: { checked, position, disabled, invalid },
            control: h.button(
              invalid ? [...resolved.checkbox, h.AriaInvalid(true)] : resolved.checkbox,
              [],
            ),
            label: h.label(resolved.label, [label]),
            description:
              description === undefined
                ? Option.none()
                : Option.some(h.p(resolved.description, [description])),
            aside: Option.fromUndefinedOr(labelAside),
            hidden:
              options.name === undefined
                ? Option.none()
                : Option.some(h.input(resolved.hiddenInput)),
          },
          h,
        ),
      ),
    },
    h,
  )
}

/**
 * What a Checkbox is given once: its look and each option that holds no
 * Message and nothing of one field.
 */
export type CheckboxPreset = Pick<CheckboxView<never>, 'position' | 'style'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Checkbox: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. `mixins` concatenate in that
 * order; any other option given at the call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<CheckboxPreset, Names>,
): {
  readonly view: <Outer>(
    options: CheckboxView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
