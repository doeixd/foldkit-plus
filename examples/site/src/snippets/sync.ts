import { MessageSet, Projection } from 'foldkit-surface'
import { DocumentId, Sync } from 'foldkit-sync'

import { App, Message } from './app.js'

// The todos replicate; adding and toggling are the durable operations, replayed
// through the same update on every device. The filter stays on this one.
export const TodoSync = Sync.forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.AddedTodo, Message.ToggledTodo]),
})
