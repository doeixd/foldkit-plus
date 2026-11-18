/**
 * The RadioGroup drawn from options: `view` over the interaction state
 * `Bundles.RadioGroup` holds and a value the application owns, and
 * `configure`, the application's own RadioGroup. A module of its own beside
 * the adapter (`../radioGroup.ts`), which stays the rung for a group an
 * application lays out itself.
 */
import * as UiRadioGroup from '@foldkit/ui/radioGroup'
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { layered, type PresetOption, type Presets } from '../configure.js'
import type { MixinList } from '../resolve.js'
import type { RowContent } from '../rowContent.js'
import { toView } from '../radioGroup.js'
import type { RadioGroupSlots } from './slots.js'

/** One radio: the row's words and marks, and the value it chooses. */
export interface RadioGroupRow<Value extends string> extends RowContent {
  readonly value: Value
}

export interface RadioGroupView<Value extends string, Outer> {
  /** The interaction state `Bundles.RadioGroup` placed, or upstream's `init` made. */
  readonly model: UiRadioGroup.Model
  readonly onMessage: (message: UiRadioGroup.Message) => Outer
  /** What the options answer: the group's accessible name, drawn above it. */
  readonly legend: string
  /** Draws no visible legend; the name stays on the group. */
  readonly hideLegend?: boolean | undefined
  readonly options: ReadonlyArray<RadioGroupRow<Value>>
  /** The chosen option's value: the application's, set from `Selected` in `onOut`. */
  readonly value: Option.Option<NoInfer<Value>>
  /** Default `vertical`. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  readonly disabled?: boolean | undefined
  /** Keeps the group navigable and not selectable. */
  readonly readOnly?: boolean | undefined
  /** The group is `aria-invalid`; an `error` implies it. */
  readonly invalid?: boolean | undefined
  /** Shown under the group, which it describes. */
  readonly error?: string | undefined
  /** Submitted under this name as the chosen value. */
  readonly name?: string | undefined
  readonly style?: NamedStyle<typeof RadioGroupSlots> | undefined
  /** Mixins beside the style: `RadioGroup.readingKeys`. */
  readonly mixins?: MixinList<Outer> | undefined
}

const bound: UiRadioGroup.Bundle = UiRadioGroup.create()

const errorId = (model: UiRadioGroup.Model) => `${model.id}-error`

export const view = <const Value extends string, Outer>(
  options: RadioGroupView<Value, Outer>,
  h: HtmlBuilder<Outer>,
): Html => {
  const { model, error } = options
  const said = error !== undefined && error !== ''
  const invalid = options.invalid === true || said
  const rows = new Map<string, RadioGroupRow<Value>>(options.options.map(row => [row.value, row]))
  const mixins = [
    ...(options.style === undefined ? [] : [options.style.mixin]),
    ...(options.mixins ?? []),
  ]
  const group = h.submodel({
    slotId: model.id,
    model,
    view: bound.view,
    viewInputs: {
      options: options.options.map(row => row.value),
      selectedValue: options.value,
      ariaLabel: options.legend,
      ...(options.orientation === 'horizontal' ? { orientation: 'Horizontal' as const } : {}),
      ...(options.disabled === true ? { isDisabled: true } : {}),
      ...(options.readOnly === true ? { isReadOnly: true } : {}),
      ...(options.name === undefined ? {} : { name: options.name }),
      isOptionDisabled: value => rows.get(value)?.disabled === true,
      hasOptionDescription: value => rows.get(value)?.description !== undefined,
      toView: toView<string, Outer>(mixins, { h }, resolved =>
        h.div(resolved.root, [
          // The group carries the name as `aria-label`, so the visible copy is hidden from a screen reader.
          ...(options.hideLegend === true
            ? []
            : [h.p([...resolved.legend, h.AriaHidden(true)], [options.legend])]),
          h.div(
            [
              ...resolved.group,
              ...(invalid ? [h.AriaInvalid(true)] : []),
              ...(said ? [h.AriaDescribedBy(errorId(model))] : []),
            ],
            resolved.options.map(option => {
              const row = rows.get(option.value)
              return h.keyed('label')(option.value, option.card, [
                h.button(option.option, []),
                ...(row?.icon === undefined ? [] : [h.span(option.icon, [row.icon])]),
                h.div(option.text, [
                  h.span(option.label, [row?.content ?? row?.label ?? option.value]),
                  ...(row?.description === undefined
                    ? []
                    : [h.div(option.description, [row.description])]),
                ]),
                ...(row?.trailing === undefined ? [] : [h.span(option.trailing, [row.trailing])]),
              ])
            }),
          ),
          ...(said ? [h.p([...resolved.error, h.Id(errorId(model))], [error])] : []),
          ...(options.name === undefined ? [] : [h.input(resolved.hiddenInput)]),
        ]),
      ),
    },
    toParentMessage: options.onMessage,
  })
  return group
}

/**
 * What a RadioGroup is given once: its look and each option that holds no
 * Message, no drawing and nothing of one group's value.
 */
export type RadioGroupPreset = Pick<
  RadioGroupView<string, never>,
  'orientation' | 'hideLegend' | 'style'
> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own RadioGroup: `base` for every use, `presets` chosen
 * at a use with `preset`, and the call over both. `mixins` concatenate in
 * that order; any other option given at the call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<RadioGroupPreset, Names>,
): {
  readonly view: <const Value extends string, Outer>(
    options: RadioGroupView<Value, Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
