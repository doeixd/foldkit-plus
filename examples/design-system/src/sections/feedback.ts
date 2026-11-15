/**
 * The Feedback section as an island: badges, alerts, a modal dialog and toasts.
 */
import { Option, Schema } from 'effect'
import { Runtime, Subscription, Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Dialog as UiDialog } from '@foldkit/ui'
import type { EntryHandlers } from '@foldkit/ui/toast'
import { SlotView } from 'foldkit-mixins'
import { FocusRecovery } from 'foldkit-primitives/interaction'
import { Alert, Button, Dialog, Toast, ToastView } from 'foldkit-mixins-ui'
import {
  AlertSuccessStyle,
  AlertWarningStyle,
  DestructiveButtonStyle,
  DialogActionsStyle,
  DialogPreviewStyle,
  GhostButtonStyle,
  NoticeAlertStyle,
  PageStyle,
  PrimaryButtonStyle,
  ToastEntryStyle,
  ToastStyle,
} from '../style.js'
import { DialogActionsSlots, NoticeAlertSlots, PageSlots, ToastEntrySlots } from '../slots.js'
import { foldsFor } from '../fold.js'
import { BadgesView, neverH } from '../shared.js'

const ToastPayload = Schema.Struct({
  title: Schema.String,
  maybeDescription: Schema.Option(Schema.String),
})

export type ToastPayload = typeof ToastPayload.Type

// Annotated: the inferred type names a foldkit internal module, which a
// composite project cannot emit a declaration for.
export const ToastStack: ReturnType<
  typeof ToastView.make<ToastPayload, typeof ToastPayload.Encoded>
> = ToastView.make(ToastPayload)

export const Model = Schema.Struct({
  dialog: UiDialog.Model,
  toast: ToastStack.Model,
  notices: Schema.Array(Schema.Struct({ id: Schema.Number, title: Schema.String })),
  nextNotice: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  OpenDeleteDialog: {},
  CloseDeleteDialog: {},
  DeleteDialog: { message: UiDialog.Message },
  Toast: { message: ToastStack.Message },
  NotifyPressed: {},
  NoticeAdded: {},
  NoticeDismissed: { id: Schema.Number },
})
export type Message = typeof Message.Type

export const initModel = (): Model => ({
  dialog: UiDialog.init({ id: 'delete-dialog' }),
  toast: ToastStack.init({ id: 'notify-toast' }),
  notices: [
    { id: 1, title: 'Backup finished' },
    { id: 2, title: 'Invite accepted' },
    { id: 3, title: 'Quota at 80%' },
  ],
  nextNotice: 4,
})

const own = foldsFor<Model, Message>()

const foldDeleteDialogOut = UiDialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({ model }),
})

const foldDeleteDialog = Update.foldChild({
  ...own('dialog', Message.DeleteDialog),
  update: UiDialog.update,
  foldOutMessage: foldDeleteDialogOut,
})

const foldDeleteDialogOpen = Update.foldChildStep({
  ...own('dialog', Message.DeleteDialog),
  update: UiDialog.open,
  foldOutMessage: foldDeleteDialogOut,
})

const foldDeleteDialogClose = Update.foldChildStep({
  ...own('dialog', Message.DeleteDialog),
  update: UiDialog.close,
  foldOutMessage: foldDeleteDialogOut,
})

const foldToast = Update.foldChild({
  ...own('toast', Message.Toast),
  update: ToastStack.update,
  foldOutMessage: ToastStack.OutMessage.match<Update.Step<Model, Message>>({
    DismissedToast: () => model => ({ model }),
  }),
})

const foldToastShow = Update.foldChild({
  ...own('toast', Message.Toast),
  update: ToastStack.show,
  foldOutMessage: ToastStack.OutMessage.match<Update.Step<Model, Message>>({
    DismissedToast: () => model => ({ model }),
  }),
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    OpenDeleteDialog: () => foldDeleteDialogOpen(model),
    CloseDeleteDialog: () => foldDeleteDialogClose(model),
    DeleteDialog: ({ message }) => foldDeleteDialog(model, message),
    Toast: ({ message }) => foldToast(model, message),
    NoticeAdded: () => ({
      model: modifyFields(model, {
        notices: notices => [
          ...notices,
          { id: model.nextNotice, title: `Notice ${model.nextNotice}` },
        ],
        nextNotice: next => next + 1,
      }),
    }),
    NoticeDismissed: ({ id }) => ({
      model: modifyFields(model, {
        notices: notices => notices.filter(notice => notice.id !== id),
      }),
    }),
    NotifyPressed: () =>
      foldToastShow(model, {
        variant: 'Success',
        payload: {
          title: 'Saved',
          maybeDescription: Option.some('Your changes are live.'),
        },
      }),
  })

/** The toast's timers reach its interaction state, which folds back through `Toast` in `update`. */
const toastSubscriptions = Subscription.lift(ToastStack.subscriptions)<Model, Message>({
  read: model => Option.some(model.toast),
  toParentMessage: message => Message.Toast({ message }),
})

/**
 * The delete confirmation, live: a real modal with focus trap, Escape to
 * cancel, and backdrop click. Nothing is actually deleted. The recipe's
 * close bundle draws the corner X; the actions dispatch a parent message
 * that runs the close step, so each keeps its own button styling.
 */
const DialogDemo = (model: Pick<Model, 'dialog'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.dialog.id,
    model: model.dialog,
    view: UiDialog.view,
    viewInputs: {
      hasDescription: true,
      toView: render => {
        const dialog = Dialog.resolve(render, [DialogPreviewStyle.mixin], { input: undefined, h })
        const actions = SlotView.buildersFor(DialogActionsSlots, [DialogActionsStyle.style.mixin], {
          input: undefined,
          h,
        })
        return h.dialog(
          dialog.dialog,
          dialog.isVisible
            ? [
                h.div(dialog.backdrop),
                h.div(dialog.panel, [
                  h.button(dialog.closeButton, [h.span([], ['×'])]),
                  h.h2(dialog.title, ['Delete this project?']),
                  h.p(dialog.description, [
                    'It goes for good, with its history. This dialog is a live modal: focus is trapped, Escape cancels.',
                  ]),
                  h.div(actions.actions.attrs(), [
                    Button.view(
                      {
                        label: 'Delete',
                        style: DestructiveButtonStyle,
                        onClick: Message.CloseDeleteDialog(),
                      },
                      h,
                    ),
                    Button.view(
                      {
                        label: 'Cancel',
                        style: GhostButtonStyle,
                        onClick: Message.CloseDeleteDialog(),
                      },
                      h,
                    ),
                  ]),
                ]),
              ]
            : [],
        )
      },
    },
    toParentMessage: message => Message.DeleteDialog({ message }),
  })

/** A notify button and the stack it feeds: entries auto-dismiss. */
const ToastDemo = (model: Pick<Model, 'toast'>, h: HtmlBuilder<Message>): Html => {
  const entry = SlotView.buildersFor(ToastEntrySlots, [ToastEntryStyle.style.mixin], {
    input: model,
    h,
  })
  // A bare wrapper: the section's stack layout forces `inline-size: 100%` on
  // its direct children, which would stretch the fixed container full-width.
  // The wrapper takes that rule instead, and the container keeps its size.
  return h.div(
    [],
    [
      h.submodel({
        slotId: model.toast.id,
        model: model.toast,
        view: ToastStack.view,
        viewInputs: {
          position: 'BottomRight',
          entryToView: (toastEntry, handlers: EntryHandlers) =>
            h.div(
              [],
              [
                h.p(entry.title.attrs(), [toastEntry.payload.title]),
                ...Option.match(toastEntry.payload.maybeDescription, {
                  onNone: () => [],
                  onSome: text => [h.p(entry.text.attrs(), [text])],
                }),
                h.button(entry.dismiss.attrs(handlers.dismiss), ['Dismiss']),
              ],
            ),
          toView: Toast.toView([ToastStyle.mixin], { h }, resolved =>
            h.div(
              resolved.container,
              resolved.entries.map(entryView =>
                h.keyed('div')(entryView.id, entryView.attributes, [entryView.content]),
              ),
            ),
          ),
        },
        toParentMessage: message => Message.Toast({ message }),
      }),
    ],
  )
}

/**
 * A dismissed alert hands its focus to the next alert's dismiss button, else the
 * previous one's, else the Add button, instead of dropping it to the page.
 */
const Recovers = FocusRecovery.behavior(NoticeAlertSlots)<unknown, never>({
  owner: 'group',
  parts: { dismiss: ['next', 'previous', { part: 'add' }], add: [] },
})

const NoticeAlerts = (model: Pick<Model, 'notices'>, h: HtmlBuilder<Message>): Html => {
  const list = SlotView.buildersFor(
    NoticeAlertSlots,
    [NoticeAlertStyle.style.mixin, Recovers.mixin],
    {
      input: undefined,
      h,
    },
  )
  return h.div(list.group.attrs(), [
    h.ul(
      list.list.attrs([h.AriaLabel('Notices')]),
      model.notices.map(notice =>
        h.keyed('li')(String(notice.id), list.item.attrs(), [
          Alert.view(
            {
              layout: 'inline',
              title: notice.title,
              icon: h.span([h.AriaHidden(true)], ['✓']),
              onDismiss: Message.NoticeDismissed({ id: notice.id }),
              recoveryPart: 'dismiss',
              style: AlertSuccessStyle,
            },
            h,
          ),
        ]),
      ),
    ),
    Button.view(
      {
        label: 'Add notice',
        style: GhostButtonStyle,
        onClick: Message.NoticeAdded(),
        attributes: { button: list.add.attrs([h.Id('add-notice')]) },
      },
      h,
    ),
  ])
}

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  return h.div(slots.body.attrs(), [
    h.p(slots.sectionText.attrs(), [
      'One badge style serves every tone through data-state; alerts speak up in their own tones; toasts stack bottom-right and dismiss themselves.',
    ]),
    BadgesView(undefined, neverH),
    Alert.view(
      {
        layout: 'inline',
        title: 'Storage almost full',
        description: 'Only 2 GB left on this project.',
        icon: h.span([h.AriaHidden(true)], ['!']),
        assertive: true,
        style: AlertWarningStyle,
      },
      neverH,
    ),
    NoticeAlerts(model, h),
    h.div(slots.row.attrs(), [
      Button.view(
        {
          label: 'Delete this project?',
          style: DestructiveButtonStyle,
          onClick: Message.OpenDeleteDialog(),
        },
        h,
      ),
    ]),
    DialogDemo(model, h),
    h.div(slots.row.attrs(), [
      Button.view(
        { label: 'Notify', style: PrimaryButtonStyle, onClick: Message.NotifyPressed() },
        h,
      ),
    ]),
    ToastDemo(model, h),
  ])
}

export const mount = (container: HTMLElement): void => {
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initModel() }),
      update,
      view,
      subscriptions: Subscription.aggregate(toastSubscriptions),
    }),
  )
}
