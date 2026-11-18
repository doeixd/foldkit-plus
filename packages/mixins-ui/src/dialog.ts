import {
  Message as DialogMessage,
  update as updateDialog,
  type Model as DialogModel,
  type RenderInfo,
} from '@foldkit/ui/dialog'
import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import * as Render from 'foldkit/render'
import { type SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { DialogSlots } from './dialog/slots.js'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

// Each behaviour value is a file of its own, so a page that never reads one
// keeps neither its Mount nor the primitive it runs.
export { focusReturn } from './dialog/focusReturn.js'
export { keyboard } from './dialog/keyboard.js'
export { overlayBars } from './dialog/overlayBars.js'
export { DialogSlots } from './dialog/slots.js'

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
   * Whether the `handle` is a control, whose attributes the application adds
   * with `attributes`, rather than decoration hidden from assistive technology.
   */
  readonly interactiveHandle?: boolean
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
    handle: context.interactiveHandle === true ? [] : [h.AriaHidden(true)],
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
 * Whether nothing usable holds focus: the body, or the dialog that just
 * closed, which keeps focus when it was the only thing in it to take it.
 */
const focusLost = (): boolean => {
  const held = document.activeElement
  return held === null || held === document.body || held.matches('dialog:not([open])')
}

/** Answers with the Dialog's own `CompletedReleaseDialogResources`, a no-op in its `update`: it has no Message for a focus Command. */
const focusAnswered = DialogMessage.CompletedReleaseDialogResources

/** What `@foldkit/ui`'s `ShowDialog` focuses when no selector is given: the initial-focus mark. */
const initialFocusSelector = '[data-foldkit-dialog-initial-focus]'
const focusable =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Puts focus back inside a dialog that was opened again mid-exit. Its panel
 * was inert and so gave up focus, and upstream's second `ShowDialog` returns at
 * once for a dialog it still holds, so nothing else places it. It goes where
 * the open would have: the `focusSelector` or the initial-focus mark, else the
 * first control. Which control had focus when the exit began is not in the
 * Model, so it is not restored.
 */
export const RestoreFocus = Command.define('Dialog.RestoreFocus', {
  args: { id: Schema.String, selector: Schema.String },
  messages: [focusAnswered],
  execute: ({ id, selector }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        const dialog = document.getElementById(id)
        if (focusLost() && dialog !== null) {
          const target = dialog.querySelector(selector) ?? dialog.querySelector(focusable)
          if (target instanceof HTMLElement) target.focus()
        }
        return focusAnswered()
      }),
    ),
})

/**
 * `@foldkit/ui`'s Dialog `update`, plus one focus repair: after an open that
 * met the exit, focus goes back inside the dialog. A closing dialog whose
 * opener is gone is `Dialog.focusReturn`'s. A `RequestedClose` on a dialog
 * that is not open is a no-op returning the Model it was given; upstream
 * rebuilds an equal one, which renders the whole page.
 */
export const update = (
  model: DialogModel,
  message: DialogMessage,
): ReturnType<typeof updateDialog> => {
  if (isDismissal(message) && !model.isOpen) return { model, commands: [] }
  const next = updateDialog(model, message)
  if (message._tag !== 'RequestedOpen' || !isLeaving(model)) return next
  const selector = Option.getOrElse(model.maybeFocusSelector, () => initialFocusSelector)
  return { ...next, commands: [...(next.commands ?? []), RestoreFocus({ id: model.id, selector })] }
}

/** `@foldkit/ui`'s `close`, through `update`: closing a closed dialog returns its Model. */
export const close = (model: DialogModel): ReturnType<typeof updateDialog> =>
  update(model, DialogMessage.RequestedClose())

/** `@foldkit/ui`'s `open`, through `update`: an open that meets the exit puts focus back. */
export const open = (model: DialogModel): ReturnType<typeof updateDialog> =>
  update(model, DialogMessage.RequestedOpen())

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
