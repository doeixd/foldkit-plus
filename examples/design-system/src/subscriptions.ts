/**
 * Child subscriptions, lifted to the application: the toast's timers reach
 * its interaction state, which folds back through `Toast` in `update`.
 */
import { Option } from 'effect'
import { Subscription } from 'foldkit'
import { Message, ToastStack, type Model } from './main.js'

const toastSubscriptions = Subscription.lift(ToastStack.subscriptions)<Model, Message>({
  read: model => Option.some(model.toast),
  toParentMessage: message => Message.Toast({ message }),
})

export const subscriptions = Subscription.aggregate(toastSubscriptions)
