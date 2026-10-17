import type { AnchorConfig } from '@foldkit/ui/anchor'
import { triggerId, type RenderInfo } from '@foldkit/ui/tooltip'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { layer, PlaceArrow } from './anchor.js'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/**
 * Tooltip is a Submodel; both upstream bundles are `ChildAttribute` groups.
 * `trigger` owns `focus`, `blur` and `pointerdown` (the hover/keyboard entry
 * points); `panel` carries the anchor Mount. `resolve` preserves each group
 * by identity.
 *
 * `layer` and `arrow` are this package's. `layer`, drawn around the panel,
 * shows it in the browser's top layer (`Anchor.layer`); draw the panel
 * without a portal (`portal: false`, as `anchor` gives). `arrow`, drawn as
 * the panel's child, points at the trigger: upstream's tooltip anchor
 * computes no arrow, so `Anchor.PlaceArrow` places it.
 */
export const TooltipSlots = Slots.define({
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Focus, Event.Blur, Event.PointerDown],
    attributes: [Attr.Role, Attr.AriaDisabled, Attr.Disabled],
  }),
  layer: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  arrow: Slot.make({ capability: Capability.Container }),
})

/**
 * The tooltip's placement, for the view's `anchor`: above its trigger and
 * centred on it, 8px off, kept 8px inside the viewport, flipping below and
 * shifting along rather than leave it. Kept in place for `layer`. `config`
 * overrides any of it.
 */
export const anchor = (config: AnchorConfig = {}): AnchorConfig => ({
  placement: 'top',
  gap: 8,
  padding: 8,
  portal: false,
  ...config,
})

export interface TooltipContext<Input, Message> extends ResolveContext<Input, Message> {
  /** The Tooltip's id (`model.id`), whose trigger the arrow points at. */
  readonly id: string
}

/** The tooltip's bundles with the attached Mixins applied. */
export type ResolvedTooltip<Message> = Resolved<RenderInfo, typeof TooltipSlots, Message>

/** Resolves the tooltip's render groups; `isVisible` passes through unchanged. */
export const resolve = <Input, Message>(
  render: RenderInfo,
  mixins: MixinList<Message>,
  context: TooltipContext<Input, Message>,
): ResolvedTooltip<Message> =>
  resolveFor(
    TooltipSlots,
    mixins,
    context,
  )({
    ...render,
    layer: layer(context.h),
    arrow: [
      context.h.AriaHidden(true),
      context.h.OnMount(PlaceArrow({ buttonId: triggerId(context.id) })),
    ],
  })

/** The tooltip's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: TooltipContext<unknown, Message>,
    draw: (resolved: ResolvedTooltip<Message>) => Html,
  ) =>
  (render: RenderInfo): Html =>
    draw(resolve(render, mixins, context))
