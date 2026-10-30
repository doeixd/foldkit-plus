/**
 * Opening a replica on its store. Type-checked but not executed.
 */
import { ReplicaId, Sync, type Storage } from '../src/index.js'
import { Todos } from './fixtures/todos-contract.js'

declare const storage: Storage

Todos.openReplica(storage)
Todos.openReplica(storage, { replicaId: ReplicaId.make('a') })
Sync.tabStorage('todos')
Sync.tabStorage('todos', { locks: undefined })

// @ts-expect-error the id is an option after the store, not the first argument
Todos.openReplica(ReplicaId.make('a'), storage)
// @ts-expect-error a plain string is not a replica id
Todos.openReplica(storage, { replicaId: 'a' })
// @ts-expect-error a tab's store is named by a string
Sync.tabStorage(ReplicaId)
