# Events, folds and gates

Suppose your todo app syncs `todos` across devices while keeping `filter` (`'all'` or `'done'`) local to each device. You add a `ClearedShown` Message that checks `model.filter` inside `update` so it removes only the todos visible on screen.

On your laptop with `filter: 'done'`, `ClearedShown` clears only completed items. On the server and on your phone, however, `filter` is local and not shared, so both replay `ClearedShown` with `initial.filter` (`'all'`) and wipe out **every** todo in the list. When the synced state lands back on your laptop, your screen clears too.

That bug reveals the three rules behind shared state in Foldkit Plus:

1. **A replicated Message must carry the exact facts of what changed**, never depend on unshared local state.
2. **State is whatever `update` leaves after folding Messages**, starting from `initial`.
3. **Correctness is enforced at the server gate** (`authorize` and `laws`), not by trusting the client's `Message` union.

## Fold Messages into state

Start with a standard Foldkit application tracking `todos` and a local `filter`:

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, forApplication } from 'foldkit-sync'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  filter: Schema.Literals(['all', 'done']),
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  CompletedTodo: { id: Schema.String },
  ClearedTodos: { ids: Schema.Array(Schema.String) },
  ChoseFilter: { filter: Schema.Literals(['all', 'done']) },
})
type Message = typeof Message.Type

const initial: Model = { todos: [], filter: 'all' }

type Return = Update.Return<Model, Message>

const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: modifyFields(model, { todos: () => [...model.todos, { id, title, done: false }] }),
    }),
    CompletedTodo: ({ id }) => ({
      model: modifyFields(model, {
        todos: () => model.todos.map(todo => (todo.id === id ? { ...todo, done: true } : todo)),
      }),
    }),
    ClearedTodos: ({ ids }) => ({
      model: modifyFields(model, {
        todos: () => model.todos.filter(todo => !ids.includes(todo.id)),
      }),
    }),
    ChoseFilter: ({ filter }) => ({ model: modifyFields(model, { filter: () => filter }) }),
  })

const App = Surface.application({ Model, Message, initial, update })
```

Folding a sequence of Messages through `update` gives the `Model` directly:

```ts
const history: ReadonlyArray<Message> = [
  Message.CreatedTodo({ id: 'a', title: 'Write the guide' }),
  Message.CreatedTodo({ id: 'b', title: 'Review it' }),
  Message.CompletedTodo({ id: 'a' }),
]

const folded = history.reduce((model, message) => update(model, message).model, initial)
console.log(folded)
```

Running that fold prints:

```text
{
  todos: [
    { id: 'a', title: 'Write the guide', done: true },
    { id: 'b', title: 'Review it', done: false }
  ],
  filter: 'all'
}
```

Todo `a` (done) is never stored as a separate record locally; it is the result of folding those three Messages. In a plain local app, the Foldkit runtime runs each Message through `update` and discards the Message immediately.

## Decide locally, store the fact

When `foldkit-sync` replays a durable Message on the server or on another device, it installs the shared slice (`todos`) into `initial`, runs `update`, and reads `todos` back. Every unshared field — like `filter` — starts at its `initial` value during replay.

| What a durable Message does | Result when submitted |
| --- | --- |
| Returns a `Command` | Refused: live side effects cannot replay |
| Modifies a field outside the shared slice | Refused, naming the unshared field |
| Reads a field outside the shared slice | Accepted, but replay sees `initial` instead |

That third case is why `ClearedShown` deletes the wrong rows. Resolve local context on the device *before* creating the durable Message, and put the concrete `ids` inside `ClearedTodos`:

```ts
const clearShownMessage = (model: Model) => {
  const shown = model.todos.filter(todo => model.filter === 'all' || todo.done)
  return Message.ClearedTodos({ ids: shown.map(todo => todo.id) })
}
```

Calling `clearShownMessage` with `filter: 'done'` over `folded` returns `ClearedTodos({ ids: ['a'] })`. Every replica now clears only `'a'`, regardless of its own local `filter`. The same rule applies to generated UUIDs and timestamps: create them once when building the intent, and store the resulting values inside the Message.

## Where state lives, and what checks it

Foldkit Plus handles local state, synced documents, and server database rows with one rule for each:

| State kind | Storage | Transition | Server gate | History kept |
| --- | --- | --- | --- | --- |
| Local `Model` | Memory only | `update` | None (view/agent checks) | None |
| Sync document | Server journal (`foldkit-durable`) | `update` on replay | `authorize`, `validate`, `laws` | Until compacted |
| Remote row | Database table | Declared writes (`Write`) | Guards, `when`, `invariant` | None |

When server database rows are edited offline through a journal, edits replay into the database table as a read model; see [Editing server data through a journal](./editing-server-data.md).

## Add a server gate to a fold

Wrap `App` with `forApplication(App)` from `foldkit-sync` to declare which slice syncs (`shared`), which Messages travel (`durable`), who may send each one (`authorize`), and what must always remain true (`laws`):

```ts
type Principal = { readonly actorId: string; readonly canWrite: boolean }

const TodoSync = forApplication(App)
  .withPrincipal<Principal>()
  .make({
    documentId: DocumentId.make('todos'),
    shared: Projection.pick(App.model.todos),
    durable: MessageSet.make(App, [
      Message.CreatedTodo,
      Message.CompletedTodo,
      Message.ClearedTodos,
    ]),
    authorize: {
      CompletedTodo: ({ message, shared }) => shared.todos.some(todo => todo.id === message.id),
    },
    laws: {
      atMost100Todos: {
        holds: ({ after }) => after.todos.length <= 100,
        message: 'A list holds 100 todos',
        path: ['todos'],
      },
    },
  })
```

Each option plays a specific role:

- **`shared`:** Names the Model slice kept in sync across replicas. Because `filter` is omitted, it stays local to each device.
- **`durable`:** Lists the `MessageSet` allowed in the outbox and server journal. `ChoseFilter` is omitted, so changing the filter updates the local screen without syncing.
- **`authorize`:** Checks permission on the server inside the commit against the authoritative snapshot *before* the operation.
- **`laws`:** Checks invariants against the snapshot *after* every durable operation.

`TodoSync` describes the sync contract as data; [Replicated state](./replication.md) shows how clients and servers execute it.

## Message allowlists, authorization rules, and laws

Declaring a `MessageSet` restricts *which kinds of change* a caller can ask for:

- A Sync replica rejects any Message outside `durable`.
- An AI agent can send only the Messages exposed in its capability set ([Agents](./agents.md)).
- A client cannot originate a Message marked `serverOnly`.

If your union contains no Message that deletes an audit record, neither a view nor an agent can delete one. The only bypass is structural installation (checkpoints or URL restoration) through declared infrastructure seams; see [the two write paths](./state-model.md#the-two-write-paths).

An allowlist alone still lets invalid states pass. Decide between `authorize` and `laws` (or `Entity.invariant` for Remote rows) by what they check:

- **`authorize` checks one Message before it runs.** A durable Message with no entry in `authorize` passes authorization by default. Whenever you add a new durable Message, check whether existing `authorize` rules should apply to it too.
- **`laws` check every Message after it runs.** Because `atMost100Todos` inspects `after.todos.length`, adding an `ImportedTodos` Message later is automatically held to the 100-item cap.
- **`Entity.invariant` checks every row write.** On database-backed Entities, invariants run on every `Write` regardless of which mutation triggered it; see [What every row holds](./declared-writes.md#what-every-row-holds-an-invariant).

## Rules run once at admission

A Message is checked when the server admits it to the journal. Once committed, it is a historical fact:

- Replicas never re-run `authorize` during replay.
- Tightening an `authorize` rule or `law` later applies to new submissions without invalidating past snapshots.
- On database rows, an existing row that predates a new `invariant` is judged by the row the *next* write leaves behind, allowing a repair write to succeed.

## One Message is both request and fact

Some event-sourced architectures separate an incoming command from multiple emitted domain events. In `foldkit-sync`, the client proposes `CreatedTodo` and the server commits that exact `CreatedTodo` Message (or rejects it).

Messages that only the server may originate are marked `serverOnly` and appended with `appendAsServer`; follow-up side effects after a commit run as reactions ([The server's own writes](./replication.md#the-servers-own-writes-and-work-after-a-commit)). If your workflow requires one command handler that emits several distinct domain events or runs a multi-step server process, model that logic on the server instead of `foldkit-sync`.

## Choosing document boundaries

Any fold can produce a read view, but a Sync document can only enforce a law when its own state holds everything needed to check that law:

> A rule can be enforced where one document's snapshot is enough to judge it.

A 100-todo limit belongs on the todo list document because the list holds all its todos. A globally unique username does *not* fit on an individual user's document because checking uniqueness requires reading every other user. See [Choosing document boundaries](./replication.md#choosing-document-boundaries) for ways to give cross-record rules a proper owner.

## Schema changes and compaction

Because durable Messages and snapshots persist across deploys:

- **The local `Model`** is ephemeral; a fresh build starts cleanly from `initial`.
- **Durable Message schemas** sit in offline outboxes and server journals across releases; evolve them with explicit migrations ([Changing a durable Message](./replication.md#changing-a-durable-message)).
- **Shared slice schemas** live in stored snapshots and checkpoints.
- **Compaction discards old Messages:** When a journal compacts past an offline replica's cursor, that replica adopts a compacted checkpoint (the folded state) rather than replaying ancient Messages.

## Limits

- The local `Model` has no gate before `update`; ignore disallowed UI actions inside `update`.
- `foldkit-remote` rows keep no event log by default; write an explicit audit Entity or edit rows through a journal when history is required.
- Neither package builds arbitrary new read models by replaying every historical event from scratch on demand.

## Background

The rule that a coarse-grained document acts as a self-contained boundary only when its own state closes over its transitions follows Rosas et al., *"Software in the natural world: A computational approach to hierarchical emergence"* (arXiv:2402.09090).

## Next

- Walk through client sync, offline outboxes, and conflict resolution: [Replicated state](./replication.md)
- See how `Message`s avoid frame-lag bugs in the UI: [Who changes application state, and how](./state-model.md)
- Trace declared entities and queries to rendered regions: [From declarations to the screen](./declared-data-to-ui.md)
