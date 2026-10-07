import { Attr, Capability, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'
import type { ToastEntryRender, ToastRenderInfo } from './toastView.js'

/**
 * Toast is a nested Submodel: one live-region `container` plus an `entry`
 * per toast. The resolver runs once per bundle and each base attribute
 * passes through by identity.
 *
 * Entries own hover and (when swipe is configured) pointer handlers, none
 * of which has an Event token — but the resolver still refuses a second
 * owner by event name. The dismiss control is drawn by the consumer's
 * `entryToView` and is not a slot: its `dismiss` bundle passes through
 * inside the entry's content.
 */
export const ToastSlots = Slots.define({
  container: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role],
  }),
  entry: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role],
  }),
})

export type ResolvedToastEntry<Message> = Omit<ToastEntryRender, 'attributes'> & {
  readonly attributes: SlotAttributes<Message>
}

export type ResolvedToast<Message> = Omit<ToastRenderInfo, 'container' | 'entries'> & {
  readonly container: SlotAttributes<Message>
  readonly entries: ReadonlyArray<ResolvedToastEntry<Message>>
}

/** Resolves the toast's container and every entry. */
export const resolve = <Input, Message>(
  render: ToastRenderInfo,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedToast<Message> => {
  const builders = buildersOf(ToastSlots, mixins, context)
  return {
    id: render.id,
    container: builders.container.attrs(render.container),
    entries: render.entries.map(entry => ({
      id: entry.id,
      attributes: builders.entry.attrs(entry.attributes),
      content: entry.content,
    })),
  }
}

/** The toast's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedToast<Message>) => Html,
  ) =>
  (render: ToastRenderInfo): Html =>
    draw(resolve(render, mixins, context))
