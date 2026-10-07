/**
 * The slider's drag subscriptions, lifted to the application: pointer moves
 * and the escape key reach the slider's interaction state, which folds back
 * through `VolumeSlider` in `update`.
 */
import { Subscription } from 'foldkit'
import * as UiSlider from '@foldkit/ui/slider'
import { Message, type Model } from './main.js'

export const subscriptions = Subscription.lift({
  volumePointer: UiSlider.subscriptions.dragPointer,
  volumeEscape: UiSlider.subscriptions.dragEscape,
})<Model, Message>({
  toChildModel: model => model.volumeSlider,
  toParentMessage: message => Message.VolumeSlider({ message }),
})
