/**
 * Child subscriptions, lifted to the application: the slider's drag and the
 * toast's timers reach their interaction state, which folds back through
 * `VolumeSlider` and `Toast` in `update`.
 */
import { Subscription } from 'foldkit'
import * as UiSlider from '@foldkit/ui/slider'
import { Message, ToastStack, type Model } from './main.js'

const volumeSubscriptions = Subscription.lift({
  volumePointer: UiSlider.subscriptions.dragPointer,
  volumeEscape: UiSlider.subscriptions.dragEscape,
})<Model, Message>({
  toChildModel: model => model.volumeSlider,
  toParentMessage: message => Message.VolumeSlider({ message }),
})

const toastSubscriptions = Subscription.lift(ToastStack.subscriptions)<Model, Message>({
  toChildModel: model => model.toast,
  toParentMessage: message => Message.Toast({ message }),
})

export const subscriptions = Subscription.aggregate(volumeSubscriptions, toastSubscriptions)
