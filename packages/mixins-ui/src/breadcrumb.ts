import { Option } from 'effect'
import {
  Behavior,
  Capability,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
  type SlotBuilders,
} from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Menu from './menu.js'
import { MenuSlots } from './menu.js'
import type { MixinList } from './resolve.js'

/**
 * A breadcrumb trail publishes its regions as slots; it owns no state,
 * messages, or bundles. The trail is a navigation landmark with an ordered
 * list; the current page is text, not a link, marked `aria-current`. The
 * recipe draws the separator between steps; a `separator` of the view's own
 * is drawn in each step after the first, hidden from assistive technology.
 * Folded (`collapse`), the middle of a long trail is one ellipsis, which
 * opens a Menu of the steps it hides, as shadcn's does, or asks the
 * application to draw the trail whole.
 */
export const BreadcrumbSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Interactive }),
  current: Slot.make({ capability: Capability.Container }),
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
  /** The ellipsis's accessible name; default `"Show 3 more"`. */
  readonly label?: ((hidden: number) => string) | undefined
}

/** The middle of a long trail folded into one ellipsis, which shows it all when pressed. */
export interface BreadcrumbExpand<Message> extends CollapseParts {
  /** Sent by the ellipsis; the application answers it by drawing the trail without `collapse`. */
  readonly onExpand: Message
  readonly menu?: undefined
}

/**
 * The middle of a long trail folded into an ellipsis that opens a Menu of
 * the steps it hides, one row each (`menuRows`). The Menu's Model is the
 * application's, made with `Menu.init` and folded with `Menu.update`; a
 * row chosen comes out as `Menu.OutMessage.Selected`, whose step `chosen`
 * finds, for the application to go to.
 */
export interface BreadcrumbMenu<Message> extends CollapseParts {
  readonly menu: {
    readonly model: Menu.Model
    readonly onMessage: (message: Menu.Message) => Message
    /** The Menu's style (`Recipes.Menu`) and mixins, as `Menu.view` takes them. */
    readonly mixins: MixinList<Message>
    readonly direction?: 'ltr' | 'rtl' | undefined
  }
  readonly onExpand?: undefined
}

export type BreadcrumbCollapse<Message> = BreadcrumbExpand<Message> | BreadcrumbMenu<Message>

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

/** The rows of the Menu a folded trail opens: one per hidden step, in order, for `Menu.init` and the view. */
export const menuRows = (
  steps: ReadonlyArray<BreadcrumbStep>,
  max: number,
): ReadonlyArray<Menu.ItemRow> =>
  collapsedOf(steps, max).hidden.map(step => ({ label: step.label }))

/**
 * The hidden step a Menu row chosen stands for, by its label (the Menu's
 * `Selected` value): the first of that label, none when no hidden step has it.
 */
export const chosen = (
  steps: ReadonlyArray<BreadcrumbStep>,
  max: number,
  value: string,
): Option.Option<BreadcrumbStep> =>
  Option.fromNullishOr(collapsedOf(steps, max).hidden.find(step => step.label === value))

/**
 * A breadcrumb trail in one call: the steps from the site root to here, a
 * style for its slots, and mixins beside the style. No upstream component
 * stands behind it.
 */
export interface BreadcrumbView<Message = never> {
  readonly steps: ReadonlyArray<BreadcrumbStep>
  /** A separator of the application's own, in place of the recipe's. */
  readonly separator?: Html | undefined
  /** Folds the middle of a trail longer than `max` into an ellipsis. */
  readonly collapse?: BreadcrumbCollapse<Message> | undefined
  /** A style of `BreadcrumbSlots`, for the trail's look. */
  readonly style?: NamedStyle<typeof BreadcrumbSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const more = (hidden: number): string => `Show ${hidden} more`

/**
 * The ellipsis: a button that asks to expand, or a Menu's trigger. The Menu
 * draws its own button, so the ellipsis slot's look and the accessible name
 * reach it as a Behavior on the Menu's `button`; the breadcrumb recipe puts
 * the ellipsis's look in the variants layer, over the Menu style's trigger.
 */
const ellipsisOf = <Message>(
  collapse: BreadcrumbCollapse<Message>,
  label: string,
  hidden: ReadonlyArray<BreadcrumbStep>,
  builders: SlotBuilders<typeof BreadcrumbSlots, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  if (collapse.menu === undefined) {
    return h.button(
      builders.ellipsis.attrs([h.Type('button'), h.AriaLabel(label), h.OnClick(collapse.onExpand)]),
      ['…'],
    )
  }
  const { menu } = collapse
  const asEllipsis = Behavior.forSlots(MenuSlots)<unknown, Message>(
    {
      button: Behavior.slot({
        requires: { capability: Capability.Interactive },
        attributes: () => builders.ellipsis.attrs([h.AriaLabel(label)]),
      }),
    },
    { name: 'BreadcrumbEllipsis' },
  ).mixin
  return Menu.view(
    {
      model: menu.model,
      rows: hidden.map(step => ({ label: step.label })),
      buttonContent: h.span(builders.dots.attrs([h.AriaHidden(true)]), ['…']),
      onMessage: menu.onMessage,
      mixins: [...menu.mixins, asEllipsis],
      ...(menu.direction === undefined ? {} : { direction: menu.direction }),
    },
    h,
  )
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
  const folded =
    collapse === undefined || hidden.length === 0
      ? []
      : [
          h.li(builders.item.attrs(), [
            ...leading(before.length),
            ellipsisOf(collapse, (collapse.label ?? more)(hidden.length), hidden, builders, h),
          ]),
        ]
  return h.nav(builders.root.attrs([h.AriaLabel('Breadcrumb'), h.Role('navigation')]), [
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
