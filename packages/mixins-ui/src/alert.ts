import { Match } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An alert publishes its regions as slots; it owns no state. Shown or
 * dismissed is the application's: `onDismiss` asks, and the next view leaves
 * the alert out. The root carries `data-layout` and `data-dismissible` for a
 * style to read.
 */
export const AlertSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] }),
  icon: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Interactive }),
  dismiss: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
})

/** A feedback family the alert can take. */
export type AlertTone = 'info' | 'success' | 'warning' | 'error'

/** An action: a link to follow, or a button that sends a Message. */
export type AlertAction<Message> =
  | { readonly label: string; readonly href: string }
  | { readonly label: string; readonly onClick: Message }

interface AlertContent<Message> {
  readonly title: string
  readonly description?: string | undefined
  /** Hidden from screen readers: the title says what the icon shows. */
  readonly icon?: Html | undefined
  readonly actions?: ReadonlyArray<AlertAction<NoInfer<Message>>> | undefined
  /** Draws a dismiss button that sends this. */
  readonly onDismiss?: NoInfer<Message> | undefined
  /** The dismiss button's name; default `Dismiss <title>` inline, `Dismiss <label>` as a banner. */
  readonly dismissLabel?: string | undefined
  /** A style of `AlertSlots`, for the alert's look. */
  readonly style?: NamedStyle<typeof AlertSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * A notice inside the content, of something that just happened: a live
 * region. `assertive` interrupts (`role="alert"`); anything else reports
 * (`role="status"`). Screen readers speak what changes in a live region, not
 * what it held when the page loaded, so draw it when the thing happens.
 */
export interface InlineAlert<Message> extends AlertContent<Message> {
  readonly layout: 'inline'
  readonly assertive?: boolean | undefined
}

/**
 * A full-width strip across a page or a section, there when it loads: a
 * region landmark (a `section` named by `label`), not a live region, which
 * would say nothing on load. The landmark lets a screen reader find it, and
 * its dismiss button, from anywhere.
 */
export interface BannerAlert<Message> extends AlertContent<Message> {
  readonly layout: 'banner'
  /** The region's name, such as "Announcement" or "Maintenance notice". */
  readonly label: string
}

export type AlertView<Message = never> = InlineAlert<Message> | BannerAlert<Message>

export const view = <Message = never>(
  options: AlertView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    AlertSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const onDismiss = options.onDismiss
  const marks = [
    h.DataAttribute('layout', options.layout),
    // Whether the root holds a dismiss button, for a recipe that keeps room for it.
    h.DataAttribute('dismissible', String(onDismiss !== undefined)),
  ]
  const region = Match.value(options).pipe(
    Match.discriminatorsExhaustive('layout')({
      inline: ({ title, assertive }) => ({
        name: title,
        draw: (children: ReadonlyArray<Html>) =>
          h.div(
            builders.root.attrs([h.Role(assertive === true ? 'alert' : 'status'), ...marks]),
            children,
          ),
      }),
      banner: ({ label }) => ({
        name: label,
        draw: (children: ReadonlyArray<Html>) =>
          h.section(builders.root.attrs([h.AriaLabel(label), ...marks]), children),
      }),
    }),
  )
  const drawAction = (action: AlertAction<Message>): Html =>
    'href' in action
      ? h.a(builders.action.attrs([h.Href(action.href)]), [action.label])
      : h.button(builders.action.attrs([h.Type('button'), h.OnClick(action.onClick)]), [
          action.label,
        ])
  const actions = options.actions ?? []
  return region.draw([
    ...(options.icon === undefined
      ? []
      : [h.span(builders.icon.attrs([h.AriaHidden(true)]), [options.icon])]),
    h.p(builders.title.attrs(), [options.title]),
    ...(options.description === undefined
      ? []
      : [h.p(builders.description.attrs(), [options.description])]),
    ...(actions.length === 0 ? [] : [h.div(builders.actions.attrs(), actions.map(drawAction))]),
    ...(onDismiss === undefined
      ? []
      : [
          h.button(
            builders.dismiss.attrs([
              h.Type('button'),
              h.AriaLabel(options.dismissLabel ?? `Dismiss ${region.name}`),
              h.OnClick(onDismiss),
            ]),
            // Named by its label, so the glyph is never read.
            ['✕'],
          ),
        ]),
  ])
}
