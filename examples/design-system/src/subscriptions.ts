/**
 * Child subscriptions, lifted to the application: the toast's timers reach
 * its interaction state, which folds back through `Toast` in `update`.
 */
import { Option, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { schemeChanges } from 'foldkit-mixins/theme'
import { Message, ToastStack, type Model } from './main.js'
import { themeChanges } from 'foldkit-mixins/theme/runtime'
import { looks } from './looks.js'

const toastSubscriptions = Subscription.lift(ToastStack.subscriptions)<Model, Message>({
  read: model => Option.some(model.toast),
  toParentMessage: message => Message.Toast({ message }),
})

/** The theme and scheme another tab chose: this tab's Model takes them and its `update` applies them. */
const otherTabs = Subscription.make<Model, Message>()(() => ({
  theme: Subscription.persistentEntry(
    themeChanges(looks).pipe(Stream.map(name => Message.ThemeChangedElsewhere({ name }))),
  ),
  scheme: Subscription.persistentEntry(
    schemeChanges().pipe(Stream.map(scheme => Message.SchemeChangedElsewhere({ scheme }))),
  ),
}))

export const subscriptions = Subscription.aggregate(toastSubscriptions, otherTabs)
