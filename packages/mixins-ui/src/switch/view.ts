/**
 * The Switch drawn from options: `view` over a checked state the
 * application owns, and `configure`, the application's own Switch. A module
 * of its own beside the adapter (`../switch.ts`), which stays the rung for a
 * switch an application lays out itself.
 */
import * as UiSwitch from '@foldkit/ui/switch'
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { toView } from '../switch.js'
import { layered, type PresetOption, type Presets } from '../configure.js'
import type { MixinList } from '../resolve.js'
import { toggleRow, type TogglePosition } from '../toggleRow.js'
import type { SwitchSlots } from './slots.js'

export interface SwitchView<Outer> {
  /** Prefixes the ids the switch draws, unique on the page. */
  readonly id: string
  /** The application's field: on or off. */
  readonly checked: boolean
  /** Sent with the state a press leaves. */
  readonly onToggle: (checked: boolean) => NoInfer<Outer>
  /** The switch's accessible name, drawn beside it. */
  readonly label: string
  /** A line under the label, which also describes the control. */
  readonly description?: string | undefined
  /** `end` puts the words before the control. Default `start`. */
  readonly position?: TogglePosition | undefined
  /** Drawn beside the label: a badge, a hint with a Tooltip. */
  readonly labelAside?: Html | undefined
  readonly disabled?: boolean | undefined
  /** Shows the state and refuses a press. */
  readonly readOnly?: boolean | undefined
  /** The track shows the error ring and says so to a screen reader. */
  readonly invalid?: boolean | undefined
  /** Submitted under this name, as `value` while on and empty otherwise. */
  readonly name?: string | undefined
  /** What an on switch submits. Default `on`. */
  readonly value?: string | undefined
  readonly style?: NamedStyle<typeof SwitchSlots> | undefined
  readonly mixins?: MixinList<Outer> | undefined
}

export const view = <Outer>(options: SwitchView<Outer>, h: HtmlBuilder<Outer>): Html => {
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
  return UiSwitch.view(
    {
      id,
      isChecked: checked,
      onToggle: options.onToggle,
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
              invalid ? [...resolved.button, h.AriaInvalid(true)] : resolved.button,
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
 * What a Switch is given once: its look and each option that holds no
 * Message and nothing of one field.
 */
export type SwitchPreset = Pick<SwitchView<never>, 'position' | 'style'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Switch: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. `mixins` concatenate in that
 * order; any other option given at the call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<SwitchPreset, Names>,
): {
  readonly view: <Outer>(
    options: SwitchView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
