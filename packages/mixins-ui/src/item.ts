import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import { overlay, type Press } from './press.js'
import type { MixinList } from './resolve.js'
import { wordsOf } from './words.js'

/**
 * An item is the row primitive: the common shape of a row of anything (a
 * setting, a notification, a file, a contact, a search result) as media at
 * the start, a title over a description, and actions at the end. It owns no
 * state, messages, or bundles; draw the parts the row has and skip the rest.
 * Reach for a Field instead when the row is a form control.
 *
 * A pressable row is one control, as a pressable card is: `overlay` is a
 * link or a button stretched over the row and named by its title, so the
 * row is one tab stop, while its actions sit above it and stay pressable on
 * their own. The root carries `data-pressable`, `data-selected` and
 * `data-disabled` for a style to read.
 */
export const ItemSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  media: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
  overlay: Slot.make({ capability: Capability.Interactive }),
})

/** The fixed text an item draws: what a link opening a new tab says. */
export interface ItemWords {
  readonly newTab: string
}

export const words: ItemWords = { newTab: 'Opens in a new tab' }

/**
 * A row in one call: the regions it earns, what pressing it does, its
 * state, a style for its slots, and mixins beside the style. `content`
 * follows the title and description in the content region. No upstream
 * component stands behind it.
 */
export interface ItemView<Message = never> {
  /** A band across the top of the row, above the media and the title; pressable above a pressable row. */
  readonly header?: Html | undefined
  /** A band across the bottom of the row; pressable above a pressable row. */
  readonly footer?: Html | undefined
  readonly content?: Html | undefined
  /** An icon, an avatar or a picture at the start. */
  readonly media?: Html | undefined
  readonly title?: string | undefined
  readonly description?: string | undefined
  /** Controls at the end, pressable above a pressable row. */
  readonly actions?: Html | undefined
  /** What pressing the row does: send a Message, or follow a link. */
  readonly press?: Press<Message> | undefined
  /** The press's accessible name; the title when omitted, and required without one. */
  readonly label?: string | undefined
  /** Chosen: `aria-pressed` on a pressing button, `aria-current` on a link. */
  readonly selected?: boolean | undefined
  readonly disabled?: boolean | undefined
  /** What a link opening a new tab says. */
  readonly words?: Partial<ItemWords> | undefined
  /** A style of `ItemSlots`, for the row's look. */
  readonly style?: NamedStyle<typeof ItemSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const flag = (on: boolean | undefined) => (on === true ? 'true' : 'false')

export const view = <Message = never>(
  options: ItemView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    ItemSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const name = options.label ?? options.title
  const { press } = options
  if (press !== undefined && name === undefined) {
    throw new Error('Item: a pressable row needs a `label` when it has no `title` to be named by')
  }
  const disabled = options.disabled === true
  return h.div(
    builders.root.attrs([
      h.DataAttribute('pressable', flag(press !== undefined)),
      h.DataAttribute('selected', flag(options.selected)),
      h.DataAttribute('disabled', flag(disabled)),
    ]),
    [
      ...(options.header === undefined ? [] : [h.div(builders.header.attrs(), [options.header])]),
      ...(options.media === undefined ? [] : [h.div(builders.media.attrs(), [options.media])]),
      h.div(builders.content.attrs(), [
        ...(options.title === undefined ? [] : [h.div(builders.title.attrs(), [options.title])]),
        ...(options.description === undefined
          ? []
          : [h.div(builders.description.attrs(), [options.description])]),
        ...(options.content === undefined ? [] : [options.content]),
      ]),
      ...(options.actions === undefined
        ? []
        : [h.div(builders.actions.attrs(), [options.actions])]),
      ...(options.footer === undefined ? [] : [h.div(builders.footer.attrs(), [options.footer])]),
      ...(press === undefined || name === undefined
        ? []
        : [
            overlay(h, builders.overlay.attrs, press, {
              name,
              selected: options.selected,
              disabled,
              newTab: wordsOf(words, options.words).newTab,
            }),
          ]),
    ],
  )
}

/**
 * A group publishes the list and each row's place in it; each row is an
 * `ItemSlots` item. A list of settings, notifications or files.
 */
export const ItemGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
})

/** One row of a group: an item with the key that keeps its DOM when it moves. */
export type ItemOfGroup<Message> = Omit<ItemView<Message>, 'style' | 'mixins'> & {
  readonly key: string
}

/** Rows as one list, divided by hairlines or apart. */
export interface ItemGroupView<Message = never> {
  /** Each row, keyed so a row removed or moved keeps its neighbours' DOM. */
  readonly items: ReadonlyArray<ItemOfGroup<Message>>
  /** The list's accessible name. */
  readonly label?: string | undefined
  /** Draws around each row, such as a link or a Tooltip's trigger. */
  readonly wrap?: ((row: Html, source: ItemOfGroup<Message>) => Html) | undefined
  /** A style of `ItemGroupSlots`, for the list. */
  readonly style?: NamedStyle<typeof ItemGroupSlots> | undefined
  /** A style of `ItemSlots` for every row. */
  readonly itemStyle?: NamedStyle<typeof ItemSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const group = <Message = never>(
  options: ItemGroupView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    ItemGroupSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const around = options.wrap ?? ((row: Html) => row)
  return h.ul(
    builders.root.attrs([
      h.Role('list'),
      ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
    ]),
    options.items.map(source => {
      const { key, ...item } = source
      return h.keyed('li')(key, builders.row.attrs(), [
        around(view({ ...item, style: options.itemStyle }, h), source),
      ])
    }),
  )
}

/** What an Item is given once: its look and words, and the look of a group of them. */
export type ItemPreset = Pick<ItemView<never>, 'style' | 'words'> & {
  readonly groupStyle?: NamedStyle<typeof ItemGroupSlots> | undefined
  readonly mixins?: MixinList<never>
}

// A preset's `style` is the row's, so a group's rows wear it; the group's own is `groupStyle`.
const forGroup = (preset: ItemPreset): Partial<ItemGroupView<never>> => ({
  ...(preset.groupStyle === undefined ? {} : { style: preset.groupStyle }),
  ...(preset.style === undefined ? {} : { itemStyle: preset.style }),
})

/**
 * The application's own Item: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. A preset's `style` reaches a
 * group's rows too; its `groupStyle` is the group's own.
 */
export const configure = <const Names extends string = never>(
  config: Presets<ItemPreset, Names>,
): {
  readonly view: <Outer>(
    options: ItemView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
  readonly group: <Outer>(
    options: ItemGroupView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => {
  const groups: Presets<Partial<ItemGroupView<never>>, Names> = {
    ...(config.base === undefined ? {} : { base: forGroup(config.base) }),
    ...(config.presets === undefined
      ? {}
      : {
          presets: Object.fromEntries(
            Object.entries<ItemPreset>(config.presets).map(([name, preset]) => [
              name,
              forGroup(preset),
            ]),
          ) as Record<Names, Partial<ItemGroupView<never>>>,
        }),
  }
  return {
    view: (options, h) => view(layered(config, options), h),
    group: (options, h) => group(layered(groups, options), h),
  }
}
