import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A banner: a full-width notice across the top of a page or a section, with
 * an optional action and an optional dismiss button. Alert is a notice inside
 * the content; a banner frames it. The root is a named region landmark (a
 * `section` with `aria-label`), not a live region: a banner is on the page
 * when it loads, which a live region does not announce, and a landmark lets a
 * screen reader find it, and its dismiss button, from anywhere. A notice that
 * appears because something just happened is an Alert or a Toast. Shown or
 * dismissed is the application's: `onDismiss` asks, and the next view leaves
 * the banner out.
 */
export const BannerSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.AriaLabel] }),
  icon: Slot.make({ capability: Capability.Container }),
  message: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Interactive }),
  dismiss: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
})

/** The banner's action: a link to follow, or a button that sends a Message. */
export type BannerAction<Message> =
  | { readonly label: string; readonly href: string }
  | { readonly label: string; readonly onClick: Message }

export interface BannerView<Message> {
  /** The region's name, such as "Announcement" or "Maintenance notice". */
  readonly label: string
  readonly message: string
  readonly icon?: Html | undefined
  readonly action?: BannerAction<NoInfer<Message>> | undefined
  /** Draws a dismiss button that sends this. */
  readonly onDismiss?: NoInfer<Message> | undefined
  /** The dismiss button's name; default `Dismiss <label>`. */
  readonly dismissLabel?: string | undefined
  /** A style of `BannerSlots`, for the banner's look. */
  readonly style?: NamedStyle<typeof BannerSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message>(options: BannerView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    BannerSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const drawAction = (action: BannerAction<Message>): Html =>
    'href' in action
      ? h.a(builders.action.attrs([h.Href(action.href)]), [action.label])
      : h.button(builders.action.attrs([h.Type('button'), h.OnClick(action.onClick)]), [
          action.label,
        ])
  const onDismiss = options.onDismiss
  return h.section(builders.root.attrs([h.AriaLabel(options.label)]), [
    ...(options.icon === undefined
      ? []
      : [h.span(builders.icon.attrs([h.AriaHidden(true)]), [options.icon])]),
    h.p(builders.message.attrs(), [options.message]),
    ...(options.action === undefined ? [] : [drawAction(options.action)]),
    ...(onDismiss === undefined
      ? []
      : [
          h.button(
            builders.dismiss.attrs([
              h.Type('button'),
              h.AriaLabel(options.dismissLabel ?? `Dismiss ${options.label}`),
              h.OnClick(onDismiss),
            ]),
            // Named by its label, so the glyph is never read.
            ['✕'],
          ),
        ]),
  ])
}
