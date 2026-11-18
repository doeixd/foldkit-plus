/**
 * Two lists and a toast stack, each keeping focus when what held it goes.
 * The lists are drawn here, so `FocusRecovery.behavior` is attached here: its
 * owner is each list's group, and the Alert's and the Card's dismiss buttons
 * mark themselves a part named by `recoveryPart`. A dismissed row hands its
 * focus to the next row's dismiss button, else the previous one's, else the
 * group's Add button. The stack's own `Toast.keepFocus` does the same among
 * toasts, and a toast that arrives or leaves moves nothing.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import {
  Alert,
  AlertSlots,
  Button,
  ButtonSlots,
  Card,
  CardSlots,
  Recipes,
  Toast,
  ToastSlots,
} from 'foldkit-mixins-ui'
import { FocusRecovery } from 'foldkit-primitives/interaction'
import { Message, type Model, type Notice } from './app.js'
import { focusKeptStyle } from './style.js'

export const FocusKeptSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** A list with its heading and Add button: the `FocusRecovery` owner. */
  group: Slot.make({ capability: Capability.Container }),
  heading: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  /** The fallback part: where focus goes when the last row is gone. */
  add: Slot.make({ capability: Capability.Interactive }),
  toasts: Slot.make({ capability: Capability.Container }),
})

export const ADD_ALERT_ID = 'focus-kept-add-alert'
export const ADD_CARD_ID = 'focus-kept-add-card'
export const NOTIFY_ID = 'focus-kept-notify'

const Recoverable = SlotView.over(FocusKeptSlots)<unknown, never>()

// `dismiss` is no slot: the Alert and the Card mark their dismiss button as that part (`recoveryPart`).
const Recovers = FocusRecovery.behavior(Recoverable)({
  owner: 'group',
  parts: { dismiss: ['next', 'previous', { part: 'add' }], add: [] },
})

const layout = focusKeptStyle(FocusKeptSlots)
const alertStyle = Style.forSlots(AlertSlots)(Recipes.Alert({ tone: 'info' }))
const cardStyle = Style.forSlots(CardSlots)(Recipes.Card({ padding: 'compact' }))
const buttonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)
const toastStyle = Style.forSlots(ToastSlots)(Recipes.Toast({}))

/** The styles the island draws with, for the page's sheet. */
export const focusKeptStyles = [layout, alertStyle, cardStyle, buttonStyle, toastStyle] as const

export const FocusKept = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(FocusKeptSlots, [layout.mixin, Recovers.mixin], {
    input: undefined,
    h,
  })
  const row = (notice: Notice, draw: () => Html) =>
    h.keyed('li')(notice.id, slots.item.attrs(), [draw()])
  const group = (heading: string, rows: ReadonlyArray<Html>, add: Html) =>
    h.div(slots.group.attrs(), [
      h.h3(slots.heading.attrs(), [heading]),
      h.ul(slots.list.attrs([h.AriaLabel(heading)]), rows),
      add,
    ])
  const add = (label: string, id: string, onClick: Message) =>
    Button.view(
      {
        label,
        style: buttonStyle,
        onClick,
        attributes: { button: slots.add.attrs([h.Id(id)]) },
      },
      h,
    )
  return h.div(slots.root.attrs(), [
    group(
      'Alerts',
      model.alerts.map(notice =>
        row(notice, () =>
          Alert.view(
            {
              layout: 'inline',
              title: notice.title,
              onDismiss: Message.DismissedAlert({ id: notice.id }),
              recoveryPart: 'dismiss',
              style: alertStyle,
            },
            h,
          ),
        ),
      ),
      add('Add alert', ADD_ALERT_ID, Message.AddedAlert()),
    ),
    group(
      'Cards',
      model.cards.map(notice =>
        row(notice, () =>
          Card.view(
            {
              title: notice.title,
              dismiss: { onDismiss: Message.DismissedCard({ id: notice.id }), always: true },
              recoveryPart: 'dismiss',
              style: cardStyle,
            },
            h,
          ),
        ),
      ),
      add('Add card', ADD_CARD_ID, Message.AddedCard()),
    ),
    h.div(slots.toasts.attrs(), [
      Button.view(
        {
          label: 'Show a toast',
          style: buttonStyle,
          onClick: Message.ShowedToast(),
          attributes: { button: [h.Id(NOTIFY_ID)] },
        },
        h,
      ),
      Toast.view(
        {
          model: model.toast,
          onMessage: message => Message.GotToastMessage({ message }),
          style: toastStyle,
          mixins: Toast.keepFocus,
        },
        h,
      ),
    ]),
  ])
}
