import type { AnchorConfig } from '@foldkit/ui/anchor'
import type { RenderInfo } from '@foldkit/ui/popover'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { layer } from './anchor.js'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/**
 * Popover is a Submodel; every bundle is a `ChildAttribute` group. `button`
 * owns `click` (and its pointer/keyboard handlers) while open; `panel` owns
 * `blur`; `backdrop` owns `click`. The panel and backdrop bundles also carry
 * the anchor and portal Mounts, preserved as opaque `ChildAttribute`s.
 *
 * `layer` is this package's: drawn around the panel, it shows the panel in
 * the browser's top layer (`Anchor.layer`), above every stacking context and
 * outside every `overflow` box, with the anchor placing it as before. Draw
 * the panel without a portal (`portal: false`, as `anchor` gives), or the
 * portal takes it out of the layer. `arrow` is upstream's: drawn as the
 * panel's child, it points at the trigger from `--arrow-x` and `--arrow-y`.
 */
export const PopoverSlots = Slots.define({
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.AriaDisabled, Attr.Disabled],
  }),
  layer: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container, events: [Event.Blur] }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  arrow: Slot.make({ capability: Capability.Container }),
})

/**
 * The popover's placement, for the view's `anchor`: below its trigger and
 * centred on it, 12px off for the arrow between, kept 8px inside the
 * viewport, where it flips to the other side and shifts along it rather
 * than leave, and caps its height to the room there. Kept in place for `layer`. `config` overrides any of it.
 */
export const anchor = (config: AnchorConfig = {}): AnchorConfig => ({
  placement: 'bottom',
  gap: 12,
  padding: 8,
  portal: false,
  ...config,
})

/** The popover's bundles with the attached Mixins applied. */
export type ResolvedPopover<Message> = Resolved<RenderInfo, typeof PopoverSlots, Message>

/** Resolves the popover's render groups; `isVisible` passes through unchanged. */
export const resolve = <Input, Message>(
  render: RenderInfo,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedPopover<Message> =>
  resolveFor(PopoverSlots, mixins, context)({ ...render, layer: layer(context.h) })

/** The popover's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedPopover<Message>) => Html,
  ) =>
  (render: RenderInfo): Html =>
    draw(resolve(render, mixins, context))
