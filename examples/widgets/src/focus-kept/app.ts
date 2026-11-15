/**
 * Two lists the demo owns, one of alerts and one of cards, and a stack of
 * toasts. Each list is the application's: it holds the rows and removes one
 * when its dismiss button is pressed, and `FocusRecovery` (in `view.ts`)
 * decides where the focus on that button goes, so `update` sends no focus
 * Command. The toast stack keeps its own Model, which `Toast.update` folds.
 */
import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Toast } from 'foldkit-mixins-ui'

export const ISLAND = 'focus-kept'

export const TOAST_ID = `${ISLAND}-toasts`

export const Notice = Schema.Struct({ id: Schema.String, title: Schema.String })
export type Notice = typeof Notice.Type

export const Model = Schema.Struct({
  alerts: Schema.Array(Notice),
  cards: Schema.Array(Notice),
  /** How many of each have been made, so an id is never used twice. */
  alertsMade: Schema.Number,
  cardsMade: Schema.Number,
  toast: Toast.Model,
  toastsShown: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  DismissedAlert: { id: Schema.String },
  DismissedCard: { id: Schema.String },
  AddedAlert: {},
  AddedCard: {},
  ShowedToast: {},
  GotToast: { message: Toast.Message },
})
export type Message = typeof Message.Type

const ALERTS: ReadonlyArray<Notice> = [
  { id: 'alert-1', title: 'Disk almost full' },
  { id: 'alert-2', title: 'Backup finished' },
  { id: 'alert-3', title: 'Update available' },
]

const CARDS: ReadonlyArray<Notice> = [
  { id: 'card-1', title: 'Invoice 1042' },
  { id: 'card-2', title: 'Invoice 1043' },
  { id: 'card-3', title: 'Invoice 1044' },
]

/** A toast leaves after eight seconds unless something holds the stack. */
export const initial: Model = {
  alerts: ALERTS,
  cards: CARDS,
  alertsMade: ALERTS.length,
  cardsMade: CARDS.length,
  toast: Toast.init(TOAST_ID, { duration: 8000 }),
  toastsShown: 0,
}

const without = (notices: ReadonlyArray<Notice>, id: string): ReadonlyArray<Notice> => {
  const kept = notices.filter(notice => notice.id !== id)
  return kept.length === notices.length ? notices : kept
}

const toastStep = (
  model: Model,
  next: ReturnType<typeof Toast.update>,
  counted: boolean,
): Return<Model, Message> => ({
  model:
    next.model === model.toast && !counted
      ? model
      : modifyFields(model, {
          toast: () => next.model,
          toastsShown: shown => (counted ? shown + 1 : shown),
        }),
  commands: Command.mapMessages(next.commands ?? [], message => Message.GotToast({ message })),
})

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    DismissedAlert: ({ id }) => {
      const alerts = without(model.alerts, id)
      return {
        model: alerts === model.alerts ? model : modifyFields(model, { alerts: () => alerts }),
      }
    },
    DismissedCard: ({ id }) => {
      const cards = without(model.cards, id)
      return { model: cards === model.cards ? model : modifyFields(model, { cards: () => cards }) }
    },
    AddedAlert: () => ({
      model: modifyFields(model, {
        alerts: alerts => [
          ...alerts,
          { id: `alert-${model.alertsMade + 1}`, title: `Alert ${model.alertsMade + 1}` },
        ],
        alertsMade: made => made + 1,
      }),
    }),
    AddedCard: () => ({
      model: modifyFields(model, {
        cards: cards => [
          ...cards,
          { id: `card-${model.cardsMade + 1}`, title: `Invoice ${1041 + model.cardsMade + 1}` },
        ],
        cardsMade: made => made + 1,
      }),
    }),
    ShowedToast: () =>
      toastStep(
        model,
        Toast.show(model.toast, {
          title: `Saved draft ${model.toastsShown + 1}`,
          description: 'Nothing moved your place.',
        }),
        true,
      ),
    GotToast: ({ message }) => toastStep(model, Toast.update(model.toast, message), false),
  })
