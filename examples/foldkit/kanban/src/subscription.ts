import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import type { KeyValueStore } from 'effect/unstable/persistence'
import { Subscription } from 'foldkit'

import { Message } from './message.js'
import { BoardMirror } from './mirror.js'
import type { Model } from './model.js'

const dragAndDropSubscriptions = Subscription.lift({
  dragPointer: DragAndDrop.subscriptions.documentPointer,
  dragEscape: DragAndDrop.subscriptions.documentEscape,
  dragKeyboard: DragAndDrop.subscriptions.documentKeyboard,
  autoScroll: DragAndDrop.subscriptions.autoScroll,
})<Model, Message>({
  toChildModel: model => model.dragAndDrop,
  toParentMessage: message => Message.GotDragAndDropMessage({ message }),
})

const mirrorSubscriptions = Subscription.make<Model, Message, KeyValueStore.KeyValueStore>()(
  () => BoardMirror.subscriptions,
)

export const subscriptions = Subscription.aggregate<Model, Message, KeyValueStore.KeyValueStore>()(
  dragAndDropSubscriptions,
  mirrorSubscriptions,
)
