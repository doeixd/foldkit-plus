import { Option } from 'effect'
import {
  Attr,
  Capability,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
  type SlotBuilders,
} from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { ItemRow } from './menu.js'
import type { MixinList } from './resolve.js'
import { fill, wordsOf } from './words.js'

/**
 * A breadcrumb trail publishes its regions as slots; it owns no state,
 * messages, or bundles. The trail is a navigation landmark with an ordered
 * list; the current page is text, not a link, marked `aria-current`. The
 * recipe draws the separator between steps; a `separator` of the view's own
 * is drawn in each step after the first, hidden from assistive technology.
 * Folded (`collapse`), the middle of a long trail is one ellipsis, which
 * asks the application to draw the trail whole, or opens what a
 * `CollapseFeature` draws, such as `BreadcrumbMenu.make`'s Menu of the steps
 * it hides.
 */
export const BreadcrumbSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Interactive }),
  current: Slot.make({ capability: Capability.Container, attributes: [Attr.AriaCurrent] }),
  icon: Slot.make({ capability: Capability.Container }),
  separator: Slot.make({ capability: Capability.Container }),
  ellipsis: Slot.make({ capability: Capability.Interactive }),
  /** The ellipsis's dots inside a Menu's trigger, which draws its own content box. */
  dots: Slot.make({ capability: Capability.Container }),
})

/** One step: a link anywhere but here, plain text for where we are. */
export interface BreadcrumbStep {
  readonly label: string
  readonly href?: string | undefined
  readonly current?: boolean | undefined
  /** Drawn before the label, hidden from assistive technology. */
  readonly icon?: Html | undefined
}

interface CollapseParts {
  /** The most steps drawn, the ellipsis not counted; at least 2: the first and the last. */
  readonly max: number
}

/** The middle of a long trail folded into one ellipsis, which shows it all when pressed. */
export interface BreadcrumbExpand<Message> extends CollapseParts {
  /** Sent by the ellipsis; the application answers it by drawing the trail without `collapse`. */
  readonly onExpand: Message
  readonly draw?: undefined
}

/** What a `CollapseFeature` is given to draw the ellipsis. */
export interface CollapseDraw<Message> {
  /** The ellipsis's accessible name: `words.more` with the count of hidden steps. */
  readonly label: string
  /** What the ellipsis shows: `words.ellipsis`. */
  readonly ellipsis: string
  /** The steps the trail hides, in order. */
  readonly hidden: ReadonlyArray<BreadcrumbStep>
  readonly builders: SlotBuilders<typeof BreadcrumbSlots, Message>
}

/**
 * How a folded trail draws its ellipsis, built by the application and handed
 * to the view as `collapse`. `BreadcrumbMenu.make` is one, a Menu of the hidden
 * steps; one of the application's own (a Popover, a dialog) is a value of this
 * shape. It lives apart from the trail so a page that never folds into a Menu
 * never loads Menu.
 */
export interface CollapseFeature<Message> extends CollapseParts {
  /** The `li`'s content: the ellipsis, in the trail's `ellipsis` slot or the look of it. */
  readonly draw: (input: CollapseDraw<Message>, h: HtmlBuilder<Message>) => Html
  readonly onExpand?: undefined
}

export type BreadcrumbCollapse<Message> = BreadcrumbExpand<Message> | CollapseFeature<Message>

/**
 * The steps drawn before the ellipsis, the ones it hides, and the ones after
 * it: the first step, then the last `max - 1`. A trail of `max` steps or
 * fewer hides none.
 */
export const collapsedOf = (
  steps: ReadonlyArray<BreadcrumbStep>,
  max: number,
): {
  readonly before: ReadonlyArray<BreadcrumbStep>
  readonly hidden: ReadonlyArray<BreadcrumbStep>
  readonly after: ReadonlyArray<BreadcrumbStep>
} => {
  const kept = Math.max(2, Math.floor(max))
  // No maximum to fold to (`NaN`) folds nothing, as `Infinity` does.
  if (Number.isNaN(kept) || steps.length <= kept) return { before: steps, hidden: [], after: [] }
  return {
    before: steps.slice(0, 1),
    hidden: steps.slice(1, steps.length - (kept - 1)),
    after: steps.slice(steps.length - (kept - 1)),
  }
}

/**
 * The rows of the Menu a folded trail opens: one per hidden step, in order,
 * for `Menu.init` and the view. A row's value is its step's place among the
 * hidden ones, so two steps with one label are two rows.
 */
export const menuRows = (
  steps: ReadonlyArray<BreadcrumbStep>,
  max: number,
): ReadonlyArray<ItemRow> => hiddenRows(collapsedOf(steps, max).hidden)

/** The rows of a Menu of these hidden steps; a row's value is its place among them. */
export const hiddenRows = (hidden: ReadonlyArray<BreadcrumbStep>): ReadonlyArray<ItemRow> =>
  hidden.map((step, index) => ({ value: String(index), label: step.label }))

/**
 * The hidden step a Menu row chosen stands for, by the row's value (the
 * Menu's `Selected` value); none when no hidden step has it.
 */
export const chosen = (
  steps: ReadonlyArray<BreadcrumbStep>,
  max: number,
  value: string,
): Option.Option<BreadcrumbStep> =>
  Option.fromNullishOr(collapsedOf(steps, max).hidden[Number(value)])

/**
 * A breadcrumb trail in one call: the steps from the site root to here, a
 * style for its slots, and mixins beside the style. No upstream component
 * stands behind it.
 */
export interface BreadcrumbView<Message = never> {
  /** The landmark's name, the ellipsis's name and what it shows. */
  readonly words?: Partial<BreadcrumbWords> | undefined
  readonly steps: ReadonlyArray<BreadcrumbStep>
  /** A separator of the application's own, in place of the recipe's. */
  readonly separator?: Html | undefined
  /** Folds the middle of a trail longer than `max` into an ellipsis; `BreadcrumbMenu.make` for a Menu. */
  readonly collapse?: BreadcrumbCollapse<Message> | undefined
  /** A style of `BreadcrumbSlots`, for the trail's look. */
  readonly style?: NamedStyle<typeof BreadcrumbSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export interface BreadcrumbWords {
  /** The landmark's accessible name. */
  readonly label: string
  /** The ellipsis's accessible name, `{count}` the steps it hides. */
  readonly more: string
  /** What the ellipsis shows. */
  readonly ellipsis: string
}

/** The defaults, in English: text with `{blanks}`. */
export const words: BreadcrumbWords = {
  label: 'Breadcrumb',
  more: 'Show {count} more',
  ellipsis: '…',
}

export const view = <Message = never>(
  options: BreadcrumbView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    BreadcrumbSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const text = wordsOf(words, options.words)
  const separator = options.separator
  const leading = (index: number): ReadonlyArray<Html> =>
    separator === undefined || index === 0
      ? []
      : [h.span(builders.separator.attrs([h.AriaHidden(true)]), [separator])]
  const labelled = (step: BreadcrumbStep): ReadonlyArray<Html | string> => [
    ...(step.icon === undefined
      ? []
      : [h.span(builders.icon.attrs([h.AriaHidden(true)]), [step.icon])]),
    step.label,
  ]
  const drawStep = (step: BreadcrumbStep, index: number): Html =>
    h.li(builders.item.attrs(), [
      ...leading(index),
      ...(step.current === true
        ? [h.span(builders.current.attrs([h.AriaCurrent('page')]), labelled(step))]
        : [
            h.a(
              builders.link.attrs([...(step.href === undefined ? [] : [h.Href(step.href)])]),
              labelled(step),
            ),
          ]),
    ])
  const collapse = options.collapse
  const { before, hidden, after } =
    collapse === undefined
      ? { before: options.steps, hidden: [], after: [] }
      : collapsedOf(options.steps, collapse.max)
  const label = fill(text.more, { count: hidden.length })
  const folded =
    collapse === undefined || hidden.length === 0
      ? []
      : [
          h.li(builders.item.attrs(), [
            ...leading(before.length),
            collapse.draw === undefined
              ? h.button(
                  builders.ellipsis.attrs([
                    h.Type('button'),
                    h.AriaLabel(label),
                    h.OnClick(collapse.onExpand),
                  ]),
                  [text.ellipsis],
                )
              : collapse.draw({ label, ellipsis: text.ellipsis, hidden, builders }, h),
          ]),
        ]
  return h.nav(builders.root.attrs([h.AriaLabel(text.label), h.Role('navigation')]), [
    h.ol(
      builders.list.attrs(separator === undefined ? [] : [h.DataAttribute('separator', 'custom')]),
      [
        ...before.map((step, index) => drawStep(step, index)),
        ...folded,
        ...after.map((step, index) => drawStep(step, before.length + folded.length + index)),
      ],
    ),
  ])
}
