/**
 * The Listbox drawn from options: `view` over the interaction state
 * `Bundles.Listbox` holds and a value the application owns, read through a
 * `Choice`; and `configure`, the application's own Listbox, which is also its
 * custom select. A module of its own beside the adapter (`../listbox.ts`),
 * which stays the rung for a listbox an application draws itself.
 */
import type { AnchorConfig } from '@foldkit/ui/anchor'
import type * as UiListbox from '@foldkit/ui/listbox'
import { Array as Arr } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import type { Choice } from '../choice.js'
import { layered, type PresetOption, type Presets } from '../configure.js'
import { parts, toView } from '../listbox.js'
import { Multi, create } from '../listboxView.js'
import { buildersOf, type MixinList } from '../resolve.js'
import type { RowContent } from '../rowContent.js'
import { wordsOf } from '../words.js'
import { ListboxSlots } from './slots.js'
import { words as defaultWords, type ListboxWords } from './words.js'

const single = create<string>()
const multiple = Multi.create<string>()

export interface ListboxView<Item extends string, Value, Outer> {
  /** The interaction state `Bundles.Listbox` placed, or upstream's `init` made. */
  readonly model: UiListbox.Model
  readonly onMessage: (message: UiListbox.Message) => Outer
  /** Names the trigger, which reads "label: chosen rows" (or the placeholder). */
  readonly label: string
  /**
   * How `value` is read: `Listbox.one(items)`, `many`, or the application's
   * own. The item and value types come from here alone, so every other
   * option is checked against them.
   */
  readonly choice: Choice<Item, Value>
  /** The application's field, folded through the same `choice` where the Bundle reports. */
  readonly value: NoInfer<Value>
  /** The rows offered now; default every item of the choice. */
  readonly items?: ReadonlyArray<NoInfer<Item>> | undefined
  /** A row's content; default its item as the label. */
  readonly option?: ((item: NoInfer<Item>) => RowContent) | undefined
  /** The group a row belongs to; rows of one group must be adjacent. */
  readonly groupBy?: ((item: NoInfer<Item>) => string) | undefined
  /** A group's heading, drawn in the `heading` slot; none draws the groups apart and unnamed. */
  readonly heading?: ((group: string) => Html) | undefined
  /** Shown on the trigger while nothing is chosen. */
  readonly placeholder?: string | undefined
  /**
   * What the trigger shows for the rows chosen, in place of their labels,
   * such as a stack of dots for a choice of several. The chevron stays.
   */
  readonly trigger?: ((chosen: ReadonlyArray<RowContent>) => Html) | undefined
  /**
   * A button that empties the choice while something is chosen: it sends
   * `onClear`, and the application folds `ChoiceChange.ClearedSelection()`
   * through its `choice`. Not drawn while disabled or read-only. Its name is
   * `words.clear`; a `content` of its own replaces the drawn cross.
   */
  readonly clear?: { readonly onClear: Outer; readonly content?: Html | undefined } | undefined
  readonly disabled?: boolean | undefined
  readonly invalid?: boolean | undefined
  readonly readOnly?: boolean | undefined
  /** Submits each chosen item under this name. */
  readonly name?: string | undefined
  readonly anchor?: AnchorConfig | undefined
  /** Under `'rtl'` a horizontal listbox's arrows swap; unset, the page's direction stands. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  readonly words?: Partial<ListboxWords> | undefined
  /** A style of `ListboxSlots`. */
  readonly style?: NamedStyle<typeof ListboxSlots> | undefined
  /** Mixins beside the style, such as `Listbox.fluid`. */
  readonly mixins?: MixinList<Outer> | undefined
}

/**
 * A Listbox: a button showing the choice that opens a list of rows, the
 * chosen ones marked; with the recipe, a custom select. The value is the
 * application's: it is passed at every draw, and what the reader chooses is
 * reported by the state (`Bundles.Listbox`'s `ChoiceChange`) for the
 * application to fold through the same `choice`.
 */
export const view = <const Item extends string, Value, Outer>(
  options: ListboxView<Item, Value, Outer>,
  h: HtmlBuilder<Outer>,
): Html => {
  const { model, choice, value, clear } = options
  const mixins: MixinList<Outer> = [
    ...(options.style === undefined ? [] : [options.style.mixin]),
    ...(options.mixins ?? []),
  ]
  const rowOf = options.option ?? ((item: Item): RowContent => ({ label: item }))
  const rows = new Map<string, RowContent>()
  const groups = new Map<string, string>()
  const offered = options.items ?? choice.items
  for (const item of offered) {
    rows.set(item, rowOf(item))
    if (options.groupBy !== undefined) groups.set(item, options.groupBy(item))
  }
  const chosen = choice.chosen(value)
  // A chosen item the offered rows no longer hold (a fetched page) still shows on the trigger.
  const chosenRows = chosen.map(item => rows.get(item) ?? rowOf(item))
  const drawn = parts(mixins, { h })
  // The button's name says what it chooses and what is chosen, since a name replaces its text.
  const summary =
    chosenRows.length === 0
      ? (options.placeholder ?? '')
      : chosenRows.map(row => row.label).join(', ')
  const { heading } = options
  const words = wordsOf(defaultWords, options.words)
  const shared = {
    items: offered,
    itemToConfig: (item: string) => ({ content: drawn.option(rows.get(item) ?? { label: item }) }),
    itemToValue: (item: string) => item,
    itemToSearchText: (item: string) => rows.get(item)?.label ?? item,
    isItemDisabled: (item: string) => rows.get(item)?.disabled === true,
    ariaLabel: summary === '' ? options.label : `${options.label}: ${summary}`,
    buttonContent: drawn.trigger(
      chosenRows,
      options.placeholder ?? '',
      options.trigger === undefined ? undefined : options.trigger(chosenRows),
    ),
    toView: toView(mixins, { h }),
    ...(options.groupBy === undefined
      ? {}
      : {
          itemGroupKey: (item: string) => groups.get(item) ?? '',
          ...(heading === undefined
            ? {}
            : { groupToHeading: (group: string) => ({ content: heading(group) }) }),
        }),
    ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
    ...(options.invalid === undefined ? {} : { isInvalid: options.invalid }),
    ...(options.readOnly === undefined ? {} : { isReadOnly: options.readOnly }),
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.anchor === undefined ? {} : { anchor: options.anchor }),
    ...(options.direction === undefined ? {} : { direction: options.direction }),
  }
  const list = choice.multiple
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
  const builders = buildersOf(ListboxSlots, mixins, { h })
  // A read-only listbox keeps its choice, which clearing would change.
  const clearable =
    clear !== undefined &&
    chosen.length > 0 &&
    options.disabled !== true &&
    options.readOnly !== true
  return h.div(builders.root.attrs(clearable ? [h.DataAttribute('clearable', '')] : []), [
    list,
    ...(clear === undefined || !clearable
      ? []
      : [
          h.button(
            builders.clear.attrs([
              h.Type('button'),
              h.AriaLabel(words.clear),
              h.OnClick(clear.onClear),
              // With no content of its own, the button is marked for the recipe to draw its cross.
              ...(clear.content === undefined ? [h.DataAttribute('glyph', 'cross')] : []),
            ]),
            clear.content === undefined ? [] : [clear.content],
          ),
        ]),
  ])
}

/**
 * What a Listbox is given once: its look and each option that holds no
 * Message, no drawing and nothing of one field's value.
 */
export type ListboxPreset = Pick<
  ListboxView<string, unknown, never>,
  'placeholder' | 'anchor' | 'direction' | 'words' | 'style'
> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Listbox: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. `mixins` concatenate in that
 * order and `words` merge word by word; any other option given at the call
 * replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<ListboxPreset, Names>,
): {
  readonly view: <const Item extends string, Value, Outer>(
    options: ListboxView<Item, Value, Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
