import { Effect, Scope } from 'effect'
import { Sync } from 'foldkit-sync'
import { Message } from './app.js'
import { mountReplica } from './runtime.js'
import { TodoSync } from './sync.js'

// The connection lives for the page; it is never explicitly released. Each tab
// opens a store of its own, and the replica's id is the store's.
const storageScope = Effect.runSync(Scope.make())
const replica = await Effect.runPromise(
  Sync.tabStorage('foldkit-sync-spike').pipe(
    Effect.flatMap(TodoSync.openReplica),
    Effect.provideService(Scope.Scope, storageScope),
  ),
)
const runtime = mountReplica(replica, document.querySelector<HTMLElement>('#sync-app')!)
document.querySelector<HTMLFormElement>('#create')!.addEventListener('submit', event => {
  event.preventDefault()
  const input = document.querySelector<HTMLInputElement>('#title')!
  runtime.send(Message.CreatedTodo({ id: crypto.randomUUID(), title: input.value }))
  input.value = ''
})
document.querySelector('#select')!.addEventListener('click', () => {
  const first = Effect.runSync(replica.shared).todos[0]
  if (first) runtime.send(Message.SelectedTodo({ id: first.id }))
})
