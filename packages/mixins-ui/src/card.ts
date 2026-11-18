import {
  Capability,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
  type SlotAttributes,
} from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import type { FluidHover } from 'foldkit-primitives/dom'
import { FOCUS_MARK } from 'foldkit-primitives/dom'
import { layered, type PresetOption, type Presets } from './configure.js'
import { overlay, type Press } from './press.js'
import type { MixinList } from './resolve.js'
import { fill, wordsOf } from './words.js'

export { CARD_HOVER, fluid } from './card/fluid.js'

/**
 * A card publishes its regions as slots; it owns no state. Draw the parts the
 * card has and skip the rest: a bare card is a root with content, a full one
 * adds an image, a media tile, a header with an action, and a footer.
 *
 * A pressable card is one control: `overlay` is a link or a button stretched
 * over the whole card, named by the title, so the card is one tab stop and
 * one announcement. The action, the footer and the dismiss button sit above
 * it and stay pressable on their own. The root carries `data-selected`,
 * `data-disabled`, `data-pressable` and `data-dismissible` for a style to read.
 * Given `recoveryPart`, its dismiss button is a `FocusRecovery` part: with
 * `FocusRecovery.behavior` (from `foldkit-primitives/interaction`) on the list holding the cards,
 * dismissing one hands its focus to the fallback the list's `parts` name for it instead of
 * dropping it to the page.
 */
export const CardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  image: Slot.make({ capability: Capability.Container }),
  media: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
  overlay: Slot.make({ capability: Capability.Interactive }),
  dismiss: Slot.make({ capability: Capability.Interactive }),
})

/**
 * The fixed text a card draws: the dismiss button's name (`{name}` is the
 * title or label; `dismissAlone` when the card has neither), its mark, and
 * what a link opening a new tab says.
 */
export interface CardWords {
  readonly dismiss: string
  readonly dismissAlone: string
  readonly dismissMark: string
  readonly newTab: string
}

export const words: CardWords = {
  dismiss: 'Dismiss {name}',
  dismissAlone: 'Dismiss',
  dismissMark: '✕',
  newTab: 'Opens in a new tab',
}

/** A button that removes the card, revealed on hover or focus unless `always`. */
export interface CardDismiss<Message> {
  readonly onDismiss: Message
  /** Show it at all times, rather than on hover and focus (touch always shows it). */
  readonly always?: boolean | undefined
}

/**
 * A card in one call: the regions it has, what pressing it does, its state,
 * a style for its slots, and mixins beside the style. No upstream component
 * stands behind it; this is the whole implementation.
 */
export interface CardView<Message> {
  readonly title?: string | undefined
  /** The level of the heading that holds the title, for the page's outline. Default 3. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined
  readonly description?: string | undefined
  readonly content?: Html | undefined
  /** A banner across the top of a stacked card, a square beside an inline one. */
  readonly image?: Html | undefined
  /** A leading icon or logo, drawn in a small tile. */
  readonly media?: Html | undefined
  /** Controls at the top end of the header, pressable above a pressable card. */
  readonly action?: Html | undefined
  readonly footer?: Html | undefined
  readonly press?: Press<Message> | undefined
  /** The press's accessible name; the title when omitted, and required without one. */
  readonly label?: string | undefined
  /** Chosen: `aria-pressed` on a pressing button, `aria-current="page"` on a link. */
  readonly selected?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly dismiss?: CardDismiss<Message> | undefined
  /**
   * The name of the dismiss button in the `parts` of the `FocusRecovery.behavior` on the list
   * holding the cards, which the application owns: the button marks itself that part.
   */
  readonly recoveryPart?: string | undefined
  /** The dismiss button's name and mark, and what a new-tab link says. */
  readonly words?: Partial<CardWords> | undefined
  /** A style of `CardSlots`, for the card's look. */
  readonly style?: NamedStyle<typeof CardSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const flag = (on: boolean | undefined) => (on === true ? 'true' : 'false')

const headingOf =
  <Message>(h: HtmlBuilder<Message>) =>
  (level: NonNullable<CardView<Message>['headingLevel']> = 3) =>
    ({ 2: h.h2, 3: h.h3, 4: h.h4, 5: h.h5, 6: h.h6 })[level]

export const view = <Message>(options: CardView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    CardSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const name = options.label ?? options.title
  const { press } = options
  if (press !== undefined && name === undefined) {
    throw new Error('Card: a pressable card needs a `label` when it has no `title` to be named by')
  }
  const disabled = options.disabled === true
  const text = wordsOf(words, options.words)
  const heading = headingOf(h)
  const dismiss = options.dismiss
  const hasHeader =
    options.title !== undefined || options.description !== undefined || options.action !== undefined
  return h.div(
    builders.root.attrs([
      h.DataAttribute('selected', flag(options.selected)),
      h.DataAttribute('disabled', flag(disabled)),
      h.DataAttribute('pressable', flag(press !== undefined)),
      h.DataAttribute('dismissible', flag(dismiss !== undefined)),
    ]),
    [
      ...(options.image === undefined ? [] : [h.div(builders.image.attrs(), [options.image])]),
      ...(options.media === undefined ? [] : [h.div(builders.media.attrs(), [options.media])]),
      ...(hasHeader
        ? [
            h.div(builders.header.attrs(), [
              ...(options.title === undefined
                ? []
                : [
                    heading(options.headingLevel)(
                      builders.title.attrs([h.DataAttribute('label', options.title)]),
                      [options.title],
                    ),
                  ]),
              ...(options.description === undefined
                ? []
                : [h.p(builders.description.attrs(), [options.description])]),
              ...(options.action === undefined
                ? []
                : [h.div(builders.action.attrs(), [options.action])]),
            ]),
          ]
        : []),
      ...(options.content === undefined
        ? []
        : [h.div(builders.content.attrs(), [options.content])]),
      ...(options.footer === undefined ? [] : [h.div(builders.footer.attrs(), [options.footer])]),
      ...(press === undefined || name === undefined
        ? []
        : [
            overlay(h, builders.overlay.attrs, press, {
              name,
              selected: options.selected,
              disabled,
              newTab: text.newTab,
            }),
          ]),
      ...(dismiss === undefined
        ? []
        : [
            h.button(
              builders.dismiss.attrs([
                h.Type('button'),
                h.AriaLabel(name === undefined ? text.dismissAlone : fill(text.dismiss, { name })),
                h.DataAttribute('reveal', dismiss.always === true ? 'always' : 'hover'),
                h.OnClick(dismiss.onDismiss),
                // The mark `FocusRecovery.behavior` writes on a part slot (`FOCUS_MARK.part`): the
                // card is drawn inside a list the application owns, so it has no such slot.
                ...(options.recoveryPart === undefined
                  ? []
                  : [h.DataAttribute(FOCUS_MARK.part, options.recoveryPart)]),
              ]),
              // Named by its label, so the glyph is never read.
              [text.dismissMark],
            ),
          ]),
    ],
  )
}

/**
 * A card group publishes its frame, the list of cards, each card's place in
 * it, and the one highlight that moves between the cards. The root carries
 * the most columns as `--fk-card-columns`, for a style's grid, which may lay
 * fewer where the cards would be too narrow, and `data-card-fluid`, whether
 * the highlight is drawn, so a card can tell whether to draw a hover of its own.
 */
export const CardGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

/**
 * What `Card.fluid` is: the highlight's resting values and the Mount that
 * moves it, which take `columns` to read the pointer's nearness in both
 * directions in a grid. A public interface: implement it for a highlight of
 * your own.
 */
export interface CardGroupFluid {
  readonly resting: Readonly<Record<string, string>>
  readonly mount: (columns: number) => ReturnType<typeof FluidHover>
}

/** One card of a group: a card with the key that keeps its DOM when it moves. */
export type CardOfGroup<Message> = CardView<Message> & { readonly key: string }

/**
 * Cards as one list: in one column or a grid, divided or apart, and, given
 * `fluid`, with one highlight that follows the pointer to the nearest card in
 * place of a hover on each.
 */
export interface CardGroupView<Message> {
  /** Each card, keyed so a card removed or moved keeps its neighbours' DOM. */
  readonly cards: ReadonlyArray<CardOfGroup<Message>>
  /**
   * The most columns; the recipe lays fewer where a column would be narrower
   * than its `minColumn`. More than one reads nearness in both directions. Default 1.
   */
  readonly columns?: number | undefined
  /** The highlight: `Card.fluid`. Without one the group draws none, and cards hover on their own. */
  readonly fluid?: CardGroupFluid | undefined
  /** The list's accessible name. */
  readonly label?: string | undefined
  /** Draws around each card, such as a link or a Tooltip's trigger. */
  readonly wrap?: ((card: Html, source: CardOfGroup<Message>) => Html) | undefined
  /** A style of `CardGroupSlots`, for the group's frame and highlight. */
  readonly style?: NamedStyle<typeof CardGroupSlots> | undefined
  /** A style of `CardSlots` for every card that names none of its own. */
  readonly cardStyle?: NamedStyle<typeof CardSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const group = <Message>(options: CardGroupView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    CardGroupSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const columns = options.columns ?? 1
  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error(`CardGroup: columns must be a whole number from 1, not ${columns}`)
  }
  const highlight = options.fluid
  const around = options.wrap ?? ((card: Html) => card)
  return h.div(
    builders.root.attrs([
      h.DataAttribute('card-fluid', flag(highlight !== undefined)),
      h.Style({ '--fk-card-columns': String(columns), ...highlight?.resting }),
      ...(highlight === undefined ? [] : [h.OnMount(highlight.mount(columns))]),
    ]),
    [
      ...(highlight === undefined
        ? []
        : [h.div(builders.highlight.attrs([h.AriaHidden(true)]), [])]),
      h.ul(
        builders.list.attrs([
          h.Role('list'),
          ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
        ]),
        options.cards.map(source => {
          const { key, ...card } = source
          return h.keyed('li')(
            key,
            builders.item.attrs([
              h.DataAttribute('card-item', ''),
              // `data-disabled`, which the highlight reads: an `li` allows no `aria-disabled`.
              ...(card.disabled === true ? [h.DataAttribute('disabled', 'true')] : []),
            ]),
            [around(view({ ...card, style: card.style ?? options.cardStyle }, h), source)],
          )
        }),
      ),
    ],
  )
}

/** What a Card is given once: its look and words, the look of a group of them, and its highlight. */
export type CardPreset<Message = never> = Pick<
  CardView<Message>,
  'style' | 'words' | 'headingLevel'
> & {
  readonly groupStyle?: NamedStyle<typeof CardGroupSlots> | undefined
  readonly fluid?: CardGroupFluid | undefined
  readonly mixins?: MixinList<Message>
}

// A preset's `style` is the card's, so a group's cards wear it; the group's own is `groupStyle`.
const forGroup = (preset: CardPreset): Partial<CardGroupView<never>> => ({
  ...(preset.groupStyle === undefined ? {} : { style: preset.groupStyle }),
  ...(preset.style === undefined ? {} : { cardStyle: preset.style }),
  ...(preset.fluid === undefined ? {} : { fluid: preset.fluid }),
})

/**
 * The application's own Card: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. A preset's `style` reaches a
 * group's cards too; its `groupStyle` and `fluid` are the group's own.
 */
export const configure = <const Names extends string = never>(
  config: Presets<CardPreset, Names>,
): {
  readonly view: <Outer>(
    options: CardView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
  readonly group: <Outer>(
    options: CardGroupView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => {
  const groups: Presets<Partial<CardGroupView<never>>, Names> = {
    ...(config.base === undefined ? {} : { base: forGroup(config.base) }),
    ...(config.presets === undefined
      ? {}
      : {
          presets: Object.fromEntries(
            Object.entries<CardPreset>(config.presets).map(([name, preset]) => [
              name,
              forGroup(preset),
            ]),
          ) as Record<Names, Partial<CardGroupView<never>>>,
        }),
  }
  return {
    view: (options, h) => view(layered(config, options), h),
    group: (options, h) => group(layered(groups, options), h),
  }
}
