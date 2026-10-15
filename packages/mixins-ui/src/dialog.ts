import type { Message as DialogMessage, RenderInfo } from '@foldkit/ui/dialog'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/**
 * Dialog is a Submodel: each published bundle is a `ChildAttribute` group that
 * carries the dialog boundary's dispatcher. The resolver treats those as opaque
 * and preserves their identity, so spreading a resolved bundle into the parent's
 * markup keeps routing through the dialog's `toParentMessage`.
 *
 * `dialog` owns `cancel` (the native Escape handler); `backdrop` and
 * `closeButton` own `click`. A Behavior adding its own handler to one of those
 * is a conflict, not a second silent owner.
 */
export const DialogSlots = Slots.define({
  dialog: Slot.make({
    capability: Capability.Container,
    events: [Event.Cancel],
    attributes: [Attr.AriaDescribedby],
  }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  panel: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  initialFocus: Slot.make({ capability: Capability.Focusable }),
  closeButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled],
  }),
  /**
   * The Sheet's grabber, drawn in the panel: this package's, with no upstream
   * bundle, and hidden from assistive technology. Draw it in a Sheet's panel
   * only: the Sheet recipe hides it unless `handle: 'bar'`.
   */
  handle: Slot.make({ capability: Capability.Container }),
})

/** The dialog's bundles with the attached Mixins applied. */
export type ResolvedDialog<Message> = Resolved<RenderInfo, typeof DialogSlots, Message>

export interface DialogContext<Input, Message> extends ResolveContext<Input, Message> {
  /**
   * `'alertdialog'`, the APG's alert dialog, asks for an answer: its `dialog`
   * bundle carries `role="alertdialog"`, and the application draws no close
   * button and drops the Messages `isDismissal` names. `'dialog'`, the
   * default, writes no role: the `<dialog>` element already has it.
   */
  readonly role?: 'dialog' | 'alertdialog'
}

/** Resolves the dialog's render groups; `isVisible` passes through unchanged. */
export const resolve = <Input, Message>(
  render: RenderInfo,
  mixins: MixinList<Message>,
  context: DialogContext<Input, Message>,
): ResolvedDialog<Message> => {
  const dialog =
    context.role === 'alertdialog'
      ? [...render.dialog, context.h.Role('alertdialog')]
      : render.dialog
  return resolveFor(
    DialogSlots,
    mixins,
    context,
  )({
    ...render,
    dialog,
    handle: [context.h.AriaHidden(true)],
  })
}

/**
 * Whether `message` is the dialog dismissing itself: Escape, a press on the
 * backdrop, or its close button, which upstream all send as `RequestedClose`.
 * An alert dialog (`role: 'alertdialog'`) answers only to its own buttons:
 * its application drops such a Message in `update` instead of folding it, and
 * closes from those buttons with `@foldkit/ui`'s `close`.
 */
export const isDismissal = (message: DialogMessage): boolean => message._tag === 'RequestedClose'

/** The dialog's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: DialogContext<unknown, Message>,
    draw: (resolved: ResolvedDialog<Message>) => Html,
  ) =>
  (render: RenderInfo): Html =>
    draw(resolve(render, mixins, context))
