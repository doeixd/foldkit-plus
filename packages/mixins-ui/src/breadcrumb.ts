import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A breadcrumb trail publishes its regions as slots; it owns no state,
 * messages, or bundles. The trail is a navigation landmark with an ordered
 * list; the current page is text, not a link, marked `aria-current`.
 */
export const BreadcrumbSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Interactive }),
  current: Slot.make({ capability: Capability.Container }),
})

/** One step: a link anywhere but here, plain text for where we are. */
export interface BreadcrumbStep {
  readonly label: string
  readonly href?: string | undefined
  readonly current?: boolean | undefined
}

/**
 * A breadcrumb trail in one call: the steps from the site root to here, a
 * style for its slots, and mixins beside the style. No upstream component
 * stands behind it.
 */
export interface BreadcrumbView {
  readonly steps: ReadonlyArray<BreadcrumbStep>
  /** A style of `BreadcrumbSlots`, for the trail's look. */
  readonly style?: NamedStyle<typeof BreadcrumbSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: BreadcrumbView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    BreadcrumbSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.nav(builders.root.attrs([h.AriaLabel('Breadcrumb'), h.Role('navigation')]), [
    h.ol(builders.list.attrs(), [
      ...options.steps.map(step =>
        h.li(builders.item.attrs(), [
          ...(step.current === true
            ? [h.span(builders.current.attrs([h.AriaCurrent('page')]), [step.label])]
            : [
                h.a(
                  builders.link.attrs([...(step.href === undefined ? [] : [h.Href(step.href)])]),
                  [step.label],
                ),
              ]),
        ]),
      ),
    ]),
  ])
}
