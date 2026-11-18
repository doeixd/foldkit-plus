/**
 * The native Select drawn from options: `view`, and `configure`, the
 * application's own Select. A module of its own beside the adapter
 * (`../select.ts`), which stays the rung for a select an application lays
 * out itself.
 */
import * as UiSelect from '@foldkit/ui/select'
import { Array as Arr } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle, SlotAttributes } from 'foldkit-mixins'
import { layered, type PresetOption, type Presets } from '../configure.js'
import type { MixinList } from '../resolve.js'
import { toView } from '../select.js'
import type { SelectSlots } from './slots.js'

export interface SelectOption {
  /** What the select reports and submits. */
  readonly value: string
  readonly label: string
  /** Options in a row with the same group sit under one heading. */
  readonly group?: string | undefined
  readonly disabled?: boolean | undefined
}

export interface SelectView<Outer> {
  /** Prefixes the ids the select draws, unique on the page. */
  readonly id: string
  /** The select's accessible name, drawn above it. */
  readonly label: string
  readonly options: ReadonlyArray<SelectOption>
  /** The chosen option's value: the application's. With none given, the browser's first option is chosen. */
  readonly value?: string | undefined
  /** Sent with the value a choice leaves. Without it the select is the browser's own. */
  readonly onChange?: ((value: string) => NoInfer<Outer>) | undefined
  /** An empty first option that names what to choose, and cannot be chosen again. */
  readonly placeholder?: string | undefined
  /** A line under the select, which describes it. */
  readonly description?: string | undefined
  readonly disabled?: boolean | undefined
  readonly invalid?: boolean | undefined
  /** Submitted under this name as the chosen value. */
  readonly name?: string | undefined
  readonly style?: NamedStyle<typeof SelectSlots> | undefined
  readonly mixins?: MixinList<Outer> | undefined
}

export const view = <Outer>(options: SelectView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const { value, placeholder, description } = options
  const mixins = [
    ...(options.style === undefined ? [] : [options.style.mixin]),
    ...(options.mixins ?? []),
  ]
  const optionOf = (slot: SlotAttributes<Outer>, option: SelectOption): Html =>
    h.option(
      [
        ...slot,
        h.Value(option.value),
        ...(option.disabled === true ? [h.Disabled(true)] : []),
        ...(value === undefined ? [] : [h.Selected(option.value === value)]),
      ],
      [option.label],
    )
  // Neighbours of one group share a heading; a row with none stands outside any.
  const grouped = Arr.isReadonlyArrayNonEmpty(options.options)
    ? Arr.groupWith(options.options, (a, b) => a.group === b.group)
    : []
  return UiSelect.view(
    {
      id: options.id,
      isDisabled: options.disabled === true,
      isInvalid: options.invalid === true,
      hasDescription: description !== undefined,
      ...(options.onChange === undefined ? {} : { onChange: options.onChange }),
      ...(value === undefined ? {} : { value }),
      ...(options.name === undefined ? {} : { name: options.name }),
      toView: toView(mixins, { h }, resolved =>
        h.div(resolved.root, [
          h.label([...resolved.label, h.For(options.id)], [options.label]),
          h.select(resolved.select, [
            ...(placeholder === undefined
              ? []
              : [
                  h.option(
                    [
                      ...resolved.option,
                      h.Value(''),
                      h.Disabled(true),
                      h.Selected(value === undefined || value === ''),
                    ],
                    [placeholder],
                  ),
                ]),
            ...grouped.flatMap(run => {
              const group = run[0].group
              return group === undefined
                ? run.map(each => optionOf(resolved.option, each))
                : [
                    h.optgroup(
                      [...resolved.group, h.Attribute('label', group)],
                      run.map(each => optionOf(resolved.option, each)),
                    ),
                  ]
            }),
          ]),
          ...(description === undefined ? [] : [h.p(resolved.description, [description])]),
        ]),
      ),
    },
    h,
  )
}

/**
 * What a Select is given once: its look and each option that holds no
 * Message and nothing of one field.
 */
export type SelectPreset = Pick<SelectView<never>, 'placeholder' | 'style'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Select: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. `mixins` concatenate in that
 * order; any other option given at the call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<SelectPreset, Names>,
): {
  readonly view: <Outer>(
    options: SelectView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
