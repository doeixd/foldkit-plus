/**
 * The Combobox drawn from options: `view` over the interaction state
 * `Bundles.Combobox` holds and a value the application owns, read through a
 * `Choice`; and `configure`, the application's own Combobox. A module of its
 * own beside the adapter (`../combobox.ts`), which stays the rung for a
 * combobox an application draws itself.
 */
import type { AnchorConfig } from '@foldkit/ui/anchor'
import type * as UiCombobox from '@foldkit/ui/combobox'
import { Array as Arr } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import type { Choice } from '../choice.js'
import { parts, toView } from '../combobox.js'
import { Multi, create } from '../comboboxView.js'
import { layered, type PresetOption, type Presets } from '../configure.js'
import type { MixinList } from '../resolve.js'
import type { RowContent } from '../rowContent.js'
import type { ComboboxSlots } from './slots.js'
import type { ComboboxWords } from './words.js'

const single = create<string>()
const multiple = Multi.create<string>()

export interface ComboboxView<Item extends string, Value, Outer> {
  /** The interaction state `Bundles.Combobox` placed, or upstream's `init` made. */
  readonly model: UiCombobox.Model
  readonly onMessage: (message: UiCombobox.Message) => Outer
  /** The field's accessible name. */
  readonly label: string
  /**
   * How `value` is read: `Combobox.one(items)`, `many`, `text`, or the
   * application's own. The item and value types come from here alone, so
   * every other option is checked against them.
   */
  readonly choice: Choice<Item, Value>
  /** The application's field, folded through the same `choice` where the Bundle reports. */
  readonly value: NoInfer<Value>
  /** The rows offered now, such as a fetched page; default every item of the choice. */
  readonly items?: ReadonlyArray<NoInfer<Item>> | undefined
  /**
   * Which rows stay for the typed text, by label: `Combobox.contains`,
   * `Combobox.startsWith`, or the application's own. None offers every row,
   * as a list fetched for the text needs.
   */
  readonly filter?: ((label: string, typed: string) => boolean) | undefined
  /** A row's content; default its item as the label. */
  readonly option?: ((item: NoInfer<Item>) => RowContent) | undefined
  /** The group a row belongs to; rows of one group must be adjacent. */
  readonly groupBy?: ((item: NoInfer<Item>) => string) | undefined
  /** A group's heading, drawn in the `heading` slot; none draws the groups apart and unnamed. */
  readonly heading?: ((group: string) => Html) | undefined
  readonly placeholder?: string | undefined
  /** Shown in the list's place while open with no rows. */
  readonly empty?: Html | undefined
  /** A button that empties the field while it holds text; its name is `words.clear`. */
  readonly clear?: true | { readonly content: Html } | undefined
  /** Draws each chosen item as a chip in the field, for a choice of several. */
  readonly chips?: boolean | undefined
  /** The toggle button's content, in place of the recipe's chevron. */
  readonly buttonContent?: Html | undefined
  readonly disabled?: boolean | undefined
  readonly invalid?: boolean | undefined
  readonly readOnly?: boolean | undefined
  /** Submits each chosen item under this name. */
  readonly name?: string | undefined
  readonly openOnFocus?: boolean | undefined
  readonly anchor?: AnchorConfig | undefined
  readonly words?: Partial<ComboboxWords> | undefined
  /** A style of `ComboboxSlots`. */
  readonly style?: NamedStyle<typeof ComboboxSlots> | undefined
  /** Mixins beside the style, such as `Combobox.fluid`. */
  readonly mixins?: MixinList<Outer> | undefined
}

/**
 * A Combobox: a text field over a list of rows, the chosen ones marked. The
 * value is the application's: it is passed at every draw, and what the
 * reader chooses is reported by the state (`Bundles.Combobox`'s
 * `ChoiceChange`) for the application to fold through the same `choice`.
 */
export const view = <const Item extends string, Value, Outer>(
  options: ComboboxView<Item, Value, Outer>,
  h: HtmlBuilder<Outer>,
): Html => {
  const { model, choice, value, clear } = options
  const mixins: MixinList<Outer> = [
    ...(options.style === undefined ? [] : [options.style.mixin]),
    ...(options.mixins ?? []),
  ]
  const typed = model.inputValue
  const rowOf = options.option ?? ((item: Item): RowContent => ({ label: item }))
  // One pass: every item's row, by its value, and the rows the typed text leaves.
  const rows = new Map<string, RowContent>()
  const groups = new Map<string, string>()
  const offered: Array<Item> = []
  for (const item of options.items ?? choice.items) {
    const row = rowOf(item)
    rows.set(item, row)
    if (options.groupBy !== undefined) groups.set(item, options.groupBy(item))
    if (options.filter === undefined || options.filter(row.label, typed)) offered.push(item)
  }
  const labelOf = (item: string): string => rows.get(item)?.label ?? item
  const drawn = parts(mixins, { h })
  const { heading } = options
  const chosen = choice.chosen(value)
  const shared = {
    items: offered,
    restingInputValue: choice.resting(value, labelOf),
    itemToConfig: (item: string) => ({
      content: drawn.option(rows.get(item) ?? { label: item }, typed),
    }),
    itemToValue: (item: string) => item,
    itemToDisplayText: labelOf,
    isItemDisabled: (item: string) => rows.get(item)?.disabled === true,
    ariaLabel: options.label,
    toView: toView(mixins, { h }),
    ...(options.groupBy === undefined
      ? {}
      : {
          itemGroupKey: (item: string) => groups.get(item) ?? '',
          ...(heading === undefined
            ? {}
            : { groupToHeading: (group: string) => ({ content: heading(group) }) }),
        }),
    ...(options.placeholder === undefined ? {} : { inputPlaceholder: options.placeholder }),
    ...(options.empty === undefined ? {} : { empty: options.empty }),
    // With no content of its own, the button is marked for the recipe to draw its cross.
    ...(clear === undefined ? {} : { clearContent: clear === true ? null : clear.content }),
    ...(options.chips === true ? { chips: {} } : {}),
    ...(options.buttonContent === undefined ? {} : { buttonContent: options.buttonContent }),
    ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
    ...(options.invalid === undefined ? {} : { isInvalid: options.invalid }),
    ...(options.readOnly === undefined ? {} : { isReadOnly: options.readOnly }),
    ...(options.name === undefined ? {} : { formName: options.name }),
    ...(options.openOnFocus === undefined ? {} : { openOnFocus: options.openOnFocus }),
    ...(options.anchor === undefined ? {} : { anchor: options.anchor }),
    ...(options.words === undefined ? {} : { words: options.words }),
  }
  return choice.multiple
    ? h.submodel({
        slotId: model.id,
        model,
        view: multiple.view,
        viewInputs: { ...shared, selectedValues: chosen },
        toParentMessage: options.onMessage,
      })
    : h.submodel({
        slotId: model.id,
        model,
        view: single.view,
        viewInputs: { ...shared, maybeSelectedValue: Arr.head(chosen) },
        toParentMessage: options.onMessage,
      })
}

/**
 * What a Combobox is given once: its look and each option that holds no
 * Message, no drawing and nothing of one field's value.
 */
export type ComboboxPreset = Pick<
  ComboboxView<string, unknown, never>,
  'filter' | 'placeholder' | 'chips' | 'openOnFocus' | 'anchor' | 'words' | 'style'
> & {
  /** The clear button with its default mark; a mark of the application's own is drawn at the call. */
  readonly clear?: true
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Combobox: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. `mixins` concatenate in that
 * order and `words` merge word by word; any other option given at the call
 * replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<ComboboxPreset, Names>,
): {
  readonly view: <const Item extends string, Value, Outer>(
    options: ComboboxView<Item, Value, Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
