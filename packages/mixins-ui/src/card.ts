import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { FLUID_PRESS_ATTRIBUTE, FluidHover, fluidHovered } from 'foldkit-primitives/dom'
import type { MixinList } from './resolve.js'

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

/** What pressing the card does: send a Message, or follow a link. */
export type CardPress<Message> =
  | { readonly onClick: Message }
  | {
      readonly href: string
      /** Open in a new tab, and say so to a screen reader. */
      readonly external?: boolean | undefined
    }

/** A button that removes the card, revealed on hover or focus unless `always`. */
export interface CardDismiss<Message> {
  readonly onDismiss: Message
  /** The button's accessible name; `Dismiss <title>` when omitted. */
  readonly label?: string | undefined
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
  readonly description?: string | undefined
  readonly content?: Html | undefined
  /** A banner across the top of a stacked card, a square beside an inline one. */
  readonly image?: Html | undefined
  /** A leading icon or logo, drawn in a small tile. */
  readonly media?: Html | undefined
  /** Controls at the top end of the header, pressable above a pressable card. */
  readonly action?: Html | undefined
  readonly footer?: Html | undefined
  readonly press?: CardPress<Message> | undefined
  /** The press's accessible name; the title when omitted, and required without one. */
  readonly label?: string | undefined
  /** Chosen: `aria-pressed` on a pressing button, `aria-current` on a link. */
  readonly selected?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly dismiss?: CardDismiss<Message> | undefined
  /** A style of `CardSlots`, for the card's look. */
  readonly style?: NamedStyle<typeof CardSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const flag = (on: boolean | undefined) => (on === true ? 'true' : 'false')

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
  const overlay = (press: CardPress<Message>, name: string): Html => {
    const shared: ReadonlyArray<Attribute<Message>> = [
      h.AriaLabel(name),
      h.Attribute(FLUID_PRESS_ATTRIBUTE, ''),
    ]
    if ('href' in press) {
      const external = press.external === true
      return h.a(
        builders.overlay.attrs([
          ...shared,
          ...(disabled
            ? [h.AriaDisabled(true)]
            : [
                h.Href(press.href),
                ...(external ? [h.Target('_blank'), h.Rel('noopener noreferrer')] : []),
              ]),
          ...(options.selected === true ? [h.AriaCurrent('true')] : []),
          ...(external ? [h.AriaDescription('Opens in a new tab')] : []),
        ]),
        [],
      )
    }
    return h.button(
      builders.overlay.attrs([
        ...shared,
        h.Type('button'),
        ...(options.selected === undefined ? [] : [h.AriaPressed(flag(options.selected))]),
        ...(disabled ? [h.Disabled(true)] : [h.OnClick(press.onClick)]),
      ]),
      [],
    )
  }
  const dismiss = options.dismiss
  const hasHeader =
    options.title !== undefined || options.description !== undefined || options.action !== undefined
  return h.div(
    builders.root.attrs([
      h.DataAttribute('selected', flag(options.selected)),
      h.DataAttribute('disabled', flag(disabled)),
      h.DataAttribute('pressable', flag(press !== undefined)),
      h.DataAttribute('dismissible', flag(dismiss !== undefined)),
      ...(disabled ? [h.AriaDisabled(true)] : []),
    ]),
    [
      ...(options.image === undefined ? [] : [h.div(builders.image.attrs(), [options.image])]),
      ...(options.media === undefined ? [] : [h.div(builders.media.attrs(), [options.media])]),
      ...(hasHeader
        ? [
            h.div(builders.header.attrs(), [
              ...(options.title === undefined
                ? []
                : [h.h3(builders.title.attrs(), [options.title])]),
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
      ...(press === undefined || name === undefined ? [] : [overlay(press, name)]),
      ...(dismiss === undefined
        ? []
        : [
            h.button(
              builders.dismiss.attrs([
                h.Type('button'),
                h.AriaLabel(dismiss.label ?? (name === undefined ? 'Dismiss' : `Dismiss ${name}`)),
                h.DataAttribute('reveal', dismiss.always === true ? 'always' : 'hover'),
                h.OnClick(dismiss.onDismiss),
              ]),
              // Named by its label, so the glyph is never read.
              ['✕'],
            ),
          ]),
    ],
  )
}

/**
 * A card group publishes its frame, the list of cards, each card's place in
 * it, and the one highlight that moves between the cards. The list carries
 * the column count as `--fk-card-columns`, for a style's grid, and each item
 * its `data-row` and `data-column`, for dividers between them.
 */
export const CardGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

/** The name of the group's highlight: its place is `--fk-card-hover-x`, `-y`, `-w`, `-h`. */
export const CARD_HOVER = 'card-hover'

const hover = fluidHovered(CARD_HOVER)

// Where the highlight rests until FluidHover first writes, so a page drawn
// without it (on a server, before the Mount starts) reads defined values.
// The view draws the same values each time, so a render never undoes a write.
const resting = {
  [hover.x]: '0px',
  [hover.y]: '0px',
  [hover.w]: '0px',
  [hover.h]: '0px',
  [hover.shown]: '0',
  [hover.moving]: '0',
}

/**
 * Cards as one list: in one column or a grid, divided or apart, with one
 * highlight that follows the pointer to the nearest card (`FluidHover`) in
 * place of a hover on each.
 */
export interface CardGroupView<Message> {
  /** Each card, keyed so a card removed or moved keeps its neighbours' DOM. */
  readonly cards: ReadonlyArray<CardView<Message> & { readonly key: string }>
  /** How many columns; more than one reads nearness in both directions. Default 1. */
  readonly columns?: number | undefined
  /** One highlight following the pointer. Default true. */
  readonly fluidHover?: boolean | undefined
  /** The list's accessible name. */
  readonly label?: string | undefined
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
  const fluid = options.fluidHover !== false
  return h.div(
    builders.root.attrs([
      ...(fluid
        ? [
            h.Style(resting),
            h.OnMount(
              FluidHover({
                name: CARD_HOVER,
                item: '[data-card-item]',
                axis: columns > 1 ? 'xy' : 'y',
                gapClick: true,
              }),
            ),
          ]
        : []),
    ]),
    [
      ...(fluid ? [h.div(builders.highlight.attrs([h.AriaHidden(true)]), [])] : []),
      h.ul(
        builders.list.attrs([
          h.Role('list'),
          h.Style({ '--fk-card-columns': String(columns) }),
          ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
        ]),
        options.cards.map(({ key, ...card }, index) =>
          h.keyed('li')(
            key,
            builders.item.attrs([
              h.DataAttribute('card-item', ''),
              // Where it sits, for a style's dividers: a grid's rows are not countable in CSS.
              h.DataAttribute('row', String(Math.floor(index / columns))),
              h.DataAttribute('column', String(index % columns)),
              ...(card.disabled === true ? [h.AriaDisabled(true)] : []),
            ]),
            [view({ ...card, style: card.style ?? options.cardStyle }, h)],
          ),
        ),
      ),
    ],
  )
}
