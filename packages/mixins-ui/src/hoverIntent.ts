import type { AnchorConfig } from '@foldkit/ui/anchor'
import type { RenderInfo } from '@foldkit/ui/hoverIntent'
import { Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { Anchor, topLayer } from './anchor.js'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/**
 * HoverIntent is a Submodel: open and close delays with intent, for a hover
 * card or a menu that should not flicker. Both bundles are `ChildAttribute`
 * groups: `trigger` owns the pointer and focus entry points, `panel` owns
 * its own so moving into the panel keeps it open. `resolve` preserves each
 * group by identity.
 *
 * Upstream's HoverIntent places nothing. Given `anchored`, `resolve` places
 * the panel against the trigger itself, as a hover card does: the panel
 * shows in the browser's top layer and the anchor positions it there, and
 * `arrow`, drawn as the panel's child, points at the trigger.
 */
export const HoverIntentSlots = Slots.define({
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Hover, Event.Focus, Event.Blur],
  }),
  panel: Slot.make({
    capability: Capability.Container,
    events: [Event.Hover, Event.Focus, Event.Blur],
  }),
  arrow: Slot.make({ capability: Capability.Container }),
})

/**
 * A hover card's placement, the default of `anchored`: below its trigger
 * and centred on it, 8px off, kept 8px inside the viewport, flipping and
 * shifting rather than leave it. `config` overrides any of it.
 */
export const anchor = (config: AnchorConfig = {}): AnchorConfig => ({
  placement: 'bottom',
  gap: 8,
  padding: 8,
  portal: false,
  ...config,
})

/** The trigger's id when `anchored` names `id`, for `focusTriggerSelector` or a label. */
export const triggerId = (id: string): string => `${id}-trigger`

export interface HoverIntentContext<Input, Message> extends ResolveContext<Input, Message> {
  /**
   * Places the panel against the trigger: the trigger takes `triggerId(id)`,
   * and the panel is anchored to it in the top layer with `anchor` (the
   * defaults of `anchor()` when left out).
   */
  readonly anchored?: { readonly id: string; readonly anchor?: AnchorConfig }
}

/** The hover intent's bundles with the attached Mixins applied. */
export type ResolvedHoverIntent<Message> = Resolved<RenderInfo, typeof HoverIntentSlots, Message>

/** Resolves the hover-intent render groups; `isVisible` passes through unchanged. */
export const resolve = <Input, Message>(
  render: RenderInfo,
  mixins: MixinList<Message>,
  context: HoverIntentContext<Input, Message>,
): ResolvedHoverIntent<Message> => {
  const { h, anchored } = context
  if (anchored === undefined) {
    return resolveFor(HoverIntentSlots, mixins, context)({ ...render, arrow: [h.AriaHidden(true)] })
  }
  const buttonId = triggerId(anchored.id)
  const arrowId = `${anchored.id}-arrow`
  return resolveFor(
    HoverIntentSlots,
    mixins,
    context,
  )({
    ...render,
    trigger: [...render.trigger, h.Id(buttonId)],
    panel: [
      ...render.panel,
      // A popover keeps the browser's `inset: 0`, of which the anchor writes
      // only `left` and `top`: right to left, `right: 0` would win.
      h.Attribute('popover', 'manual'),
      h.Style({ position: 'absolute', margin: '0', inset: 'auto', visibility: 'hidden' }),
      h.OnMount(topLayer(Anchor({ buttonId, anchor: anchor(anchored.anchor), arrowId }))),
    ],
    arrow: [h.Id(arrowId), h.AriaHidden(true)],
  })
}

/** The hover intent's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: HoverIntentContext<unknown, Message>,
    draw: (resolved: ResolvedHoverIntent<Message>) => Html,
  ) =>
  (render: RenderInfo): Html =>
    draw(resolve(render, mixins, context))
