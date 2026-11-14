import {
  Message as DialogMessage,
  update as updateDialog,
  type Model as DialogModel,
  type RenderInfo,
} from '@foldkit/ui/dialog'
import { Effect, Schema } from 'effect'
import * as Command from 'foldkit/command'
import * as Render from 'foldkit/render'
import { Attr, Behavior, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { KeyboardInset, ScrollBars } from 'foldkit-primitives/dom'
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
 *
 * `body`, `scroll`, `scrollBar`, `scrollThumb` and `footer` are this
 * package's, with no upstream bundle: a panel taller than the viewport
 * scrolls its `scroll` (inside `body`, between the title and the footer)
 * while the title and the `footer`'s answers stay in view. `overlayBars`
 * draws the overlay bar, `scrollBar` with its `scrollThumb`, inside `body`.
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
  /** The part between the heading and the footer, holding `scroll` and its bar. */
  body: Slot.make({ capability: Capability.Container }),
  /** What scrolls when the panel would outgrow the viewport. */
  scroll: Slot.make({ capability: Capability.Container }),
  scrollBar: Slot.make({ capability: Capability.Container }),
  scrollThumb: Slot.make({ capability: Capability.Container }),
  /** The answers, below `body`, in view however far it scrolls. */
  footer: Slot.make({ capability: Capability.Container }),
})

/**
 * The overlay bar on the dialog's `scroll`, the popups' list shape: pass it
 * among the mixins, and draw `scrollBar` (holding `scrollThumb`) beside
 * `scroll` in `body`. Where the pointer is coarse the browser's bar stays.
 */
export const overlayBars = [
  Behavior.forSlots(DialogSlots)<unknown, never>(
    {
      scroll: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'DialogScrollBars' },
  ).mixin,
] as const

/**
 * The on-screen keyboard's height on the `panel` (`--fk-keyboard-inset`), which the Dialog
 * and Sheet recipes keep the panel above: iOS Safari, and Chrome on Android unless the page
 * asks otherwise, leave a fixed panel under the keys when a field in it takes focus. Pass it
 * among the mixins of a dialog or sheet that holds a field. Opt in, as it sends no Message.
 */
export const keyboard = [
  Behavior.forSlots(DialogSlots)<unknown, never>(
    {
      panel: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => KeyboardInset({}),
      }),
    },
    { name: 'DialogKeyboard' },
  ).mixin,
] as const

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
  /**
   * Whether a dialog opened from this one is above it, as Base UI's nested
   * dialogs: the panel carries `data-covered`, and the recipe steps it back.
   */
  readonly covered?: boolean
  /**
   * Whether the dialog is leaving, `isLeaving(model)`. The panel is then drawn
   * `inert` for the rest of its exit: upstream already takes the backdrop and
   * close button out of a leaving dialog but leaves the application's own
   * controls live, and its `RenderInfo` does not say it is leaving.
   */
  readonly isLeaving?: boolean
  /**
   * Attributes added to a bundle before the mixins resolve, as the Sheet adds
   * its drag to the panel and the handle.
   */
  readonly attributes?: { readonly [K in keyof typeof DialogSlots]?: SlotAttributes<Message> }
}

/** Resolves the dialog's render groups; `isVisible` passes through unchanged. */
export const resolve = <Input, Message>(
  render: RenderInfo,
  mixins: MixinList<Message>,
  context: DialogContext<Input, Message>,
): ResolvedDialog<Message> => {
  const { h, attributes = {} } = context
  const own: { readonly [K in keyof typeof DialogSlots]: SlotAttributes<Message> } = {
    dialog:
      context.role === 'alertdialog' ? [...render.dialog, h.Role('alertdialog')] : render.dialog,
    backdrop: render.backdrop,
    panel: [
      ...render.panel,
      ...(context.covered === true ? [h.DataAttribute('covered', '')] : []),
      ...(context.isLeaving === true ? [h.Inert(true)] : []),
    ],
    title: render.title,
    description: render.description,
    initialFocus: render.initialFocus,
    closeButton: render.closeButton,
    handle: [h.AriaHidden(true)],
    body: [],
    scroll: [],
    // Hidden from assistive technology: the body is what a reader scrolls.
    scrollBar: [h.DataAttribute('scroll-bar', 'block'), h.AriaHidden(true)],
    scrollThumb: [],
    footer: [],
  }
  const extra = new Map<string, SlotAttributes<Message>>(Object.entries(attributes))
  const added = Object.fromEntries(
    Object.entries(own).map(([slot, base]) => [slot, [...base, ...(extra.get(slot) ?? [])]]),
  )
  return resolveFor(DialogSlots, mixins, context)({ ...render, ...own, ...added })
}

/** Whether the dialog is in its exit animation: still drawn, no longer open. */
export const isLeaving = (model: DialogModel): boolean =>
  model.animation.transitionState === 'LeaveStart' ||
  model.animation.transitionState === 'LeaveAnimating'

/**
 * Focuses the element `id` names unless something already holds focus: the
 * body is where it lands when the opener left the page while the dialog was
 * open, as `Dom.closeDialog` refocuses its recorded element only if it is
 * still connected. It answers with the Dialog's own `CompletedReleaseDialogResources`,
 * a no-op in its `update`, since the Dialog has no Message of its own for it.
 */
export const FocusFallback = Command.define('Dialog.FocusFallback', {
  args: { id: Schema.String },
  messages: [DialogMessage.CompletedReleaseDialogResources],
  execute: ({ id }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        const held = document.activeElement
        if (held === null || held === document.body) document.getElementById(id)?.focus()
        return DialogMessage.CompletedReleaseDialogResources()
      }),
    ),
})

export interface UpdateOptions {
  /**
   * The id of an element to take focus when the dialog has closed and the
   * opener could not, because it was removed meanwhile. Focus that moved
   * anywhere else is left alone, and without it nothing is guessed.
   */
  readonly focusFallback?: string
}

/** `@foldkit/ui`'s Dialog `update`, with the focus fallback after a close that lost focus. */
export const update = (
  model: DialogModel,
  message: DialogMessage,
  options: UpdateOptions = {},
): ReturnType<typeof updateDialog> => {
  const next = updateDialog(model, message)
  const { focusFallback } = options
  if (focusFallback === undefined || message._tag !== 'CompletedCloseDialog') return next
  return { ...next, commands: [...(next.commands ?? []), FocusFallback({ id: focusFallback })] }
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
