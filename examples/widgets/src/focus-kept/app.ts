/**
 * Two lists the demo owns, one of alerts and one of cards, and a stack of
 * toasts. Each list is the application's: it holds the rows and removes one
 * when its dismiss button is pressed, and `FocusRecovery` (in `view.ts`)
 * decides where the focus on that button goes, so `update` sends no focus
 * Command. The toast stack is `Bundles.Toast` placed under `toast`: its Model
 * and its Messages are the placement's, and `ShowedToast` raises one through
 * the placement's `helpers.show`.
 */
import { Match, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles } from 'foldkit-mixins-ui'

export const ISLAND = 'focus-kept'

export const TOAST_ID = `${ISLAND}-toasts`

export const Notice = Schema.Struct({ id: Schema.String, title: Schema.String })
export type Notice = typeof Notice.Type

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

const App = Bundle.compose({
  alerts: Schema.Array(Notice),
  cards: Schema.Array(Notice),
  /** How many of each have been made, so an id is never used twice. */
  alertsMade: Schema.Number,
  cardsMade: Schema.Number,
  toastsShown: Schema.Number,
}).pipe(
  Bundle.withMessages({
    DismissedAlert: { id: Schema.String },
    DismissedCard: { id: Schema.String },
    AddedAlert: {},
    AddedCard: {},
    ShowedToast: {},
  }),
  // A toast leaves after eight seconds unless something holds the stack.
  Bundle.withChild('toast', Bundles.Toast, {
    args: { id: TOAST_ID, duration: 8000 },
    onOut: Bundle.ignore,
  }),
)
export const Model = App.Model
export type Model = typeof Model.Type
export const Message = App.Message
export type Message = typeof Message.Type

export const initial: Model = App.placements.initial({
  alerts: ALERTS,
  cards: CARDS,
  alertsMade: ALERTS.length,
  cardsMade: CARDS.length,
  toastsShown: 0,
}).model

const without = (notices: ReadonlyArray<Notice>, id: string): ReadonlyArray<Notice> => {
  const kept = notices.filter(notice => notice.id !== id)
  return kept.length === notices.length ? notices : kept
}

export const update = App.placements.update((model, message) =>
  Match.valueTags(message, {
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
    ShowedToast: () => {
      const shown = App.children.toast.helpers.show({
        title: `Saved draft ${model.toastsShown + 1}`,
        description: 'Nothing moved your place.',
      })(model)
      return {
        ...shown,
        model: modifyFields(shown.model, { toastsShown: count => count + 1 }),
      }
    },
  }),
)
