# Events, folds and gates

Foldkit Plus is event-sourced in two places and state-sourced in a third. The
Model is `update` folded over every Message. A Sync document is the same fold
over a stored log of durable Messages. A Remote row is plain stored state,
changed by declared writes.

This guide is about what that gives you and what it does not. The short
version: the Messages you declare decide which kinds of change exist. They do
not make a state correct. Correctness is decided at the **gate** that admits a
Message, and the gate can only judge what the state it reads contains.

## Who owns what

| State | The log | The fold | The gate | History kept |
| --- | --- | --- | --- | --- |
| The local Model | Messages as they are dispatched; not stored | `update` | None for a view. For an agent, the capability's `available` and `authorize` | No |
| A Sync document | Durable Messages in the journal, in the server's order | `update`, through the derived replay | `authorize`, `validate` and the laws, on the server, inside the commit | Until the journal is compacted; then a checkpoint |
| A Remote row | None | None: the row is what is stored | The declared write: its rules, its `when`, the Entity's invariants | No |

A row edited offline through a journal is the second case with a table as its
read model. See
[Editing server data through a journal](./editing-server-data.md).

## The model

```text
state = update folded over the events, from initial

intent ──► gate ──► log ──► fold ──► state
            │
            └─ refused: nothing is appended
```

An entity is whatever the fold leaves. Nothing else holds it, which is the
rule in [Who changes application state](./state-model.md) seen from the other
side: no second place keeps state, so the fold's result is the state.

## The fold, in one line

Start from an application. This one keeps a todo list and a filter:

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

The Model at any moment is this, and nothing more:

```ts
const history: ReadonlyArray<Message> = [
  Message.CreatedTodo({ id: 'a', title: 'Write the guide' }),
  Message.CreatedTodo({ id: 'b', title: 'Review it' }),
  Message.CompletedTodo({ id: 'a' }),
]

const folded = history.reduce((model, message) => update(model, message).model, initial)
// { todos: [{ id: 'a', …, done: true }, { id: 'b', …, done: false }], filter: 'all' }
```

- The todo `a`, done, is not stored anywhere as a todo. It is what three
  Messages leave.
- The fold does no I/O and judges nothing. Hand it any sequence of Messages and
  it returns a Model.
- The local Model keeps no log. The runtime applies each Message and forgets
  it.

## A document: the same fold, with a gate and a stored log

Sync stores the Messages and adds the gate and the document's laws:

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

- **`shared`** is the state the fold produces: the slice every replica agrees
  on. `filter` is not in it, so it stays this device's.
- **`durable`** is the event vocabulary. Each of these Messages becomes an
  operation in the outbox and a row in the journal. `ChoseFilter` is not
  listed, so it changes the Model and goes nowhere.
- **`authorize`** is the gate on who and what may be asked. It runs on the server,
  inside the commit, against the authoritative snapshot before the operation.
- **`laws`** say what the document must always be. A cap on its length is a
  law, not an `authorize` rule: it judges what an operation leaves, so every
  Message that can grow the list is held to it, including ones added to
  `durable` later. See [A rule that fits](./replication.md#a-rule-that-fits-at-most-100-todos).

The declaration runs nothing. [Replicated state](./replication.md) covers the
client, the server and what the person sees while an edit is in flight.

## What the vocabulary gives you

A change with no Message cannot be asked for.

- A replica cannot submit a Message outside `durable`.
- An agent can only send Messages `update` already handles
  ([Agents](./agents.md)).
- A client cannot originate a Message declared `serverOnly`.

So the set of Messages is an allowlist of the kinds of change. If no Message
deletes an audit entry, no view, agent or device can delete one.

The one path around it is deliberate: infrastructure installs a value that
was already derived (a checkpoint, a restored URL) through a declared seam.
See [the two write paths](./state-model.md#the-two-write-paths).

## What it does not give you: a correct state

The fold accepts any sequence. Whether a sequence should have happened is the
gate's question, and the two hooks answer it differently:

- **An `authorize` rule covers its own Message only.** A variant without a rule
  is allowed, and the rule reads the snapshot before the operation, not the one
  it leaves.
- **A law covers every Message.** It judges the snapshot an operation leaves, so
  the cap above holds for a later `ImportedTodos` with no rule of its own.

A rule about who may ask belongs in `authorize`, and has to be written for each
Message it applies to: when you add a durable Message, ask of each existing rule
whether it applies to the new one too. A rule about what the document must
always be belongs in a law. Test a new Message at a law's limit all the same.

Rows work the other way round. An `Entity.invariant` is declared once on the
Entity and judged over the row every write would leave, whoever writes it. See
[What every row holds](./declared-writes.md#what-every-row-holds-an-invariant).

## A fact carries what it means

Replay installs the shared slice into `initial`, applies the Message and reads
the slice back. During replay every field outside the slice holds its initial
value. So a durable Message must mean the same thing whatever the rest of the
Model holds.

| A durable Message that… | On its first submit |
| --- | --- |
| returns a Command | is refused: a live effect cannot be replayed |
| changes a field outside the slice | is refused, naming the field |
| reads a field outside the slice | is accepted. Replay cannot see it |

The third is yours to keep. This Message clears the todos the person is
looking at, and decides which those are from the local filter:

```ts sketch
// Not a fact: its meaning depends on this device's filter.
ClearedShown: () => ({
  model: modifyFields(model, {
    todos: () => model.todos.filter(todo => (model.filter === 'done' ? !todo.done : false)),
  }),
})
```

On the device, `update` runs over the live Model and clears the done todos.
In the replica, on the server and on every other device, the same Message
replays with `filter: 'all'` and clears everything. The devices agree with
each other and none of them did what the person asked. The screen changes to
match when the slice is next installed from the replica.

Decide where the person is, and put the decision in the Message:

```ts sketch
// A fact: the ids say exactly what was cleared.
const shown = model.todos.filter(todo => model.filter === 'all' || todo.done)
Message.ClearedTodos({ ids: shown.map(todo => todo.id) })
```

This is the rule that already applies to ids and timestamps: a local intent
mints them, and the durable fact carries them.

## Rules are asked once

A Message is judged when it is admitted. After that it is a fact.

- Replay never asks again. A replica does not run `authorize` at all.
- Tightening a rule does not revoke history. A snapshot can hold what today's
  rule would refuse, and that is correct: it happened.
- A row is judged the same way, where a write commits. A stored row that
  breaks an invariant is judged by the row the next write leaves, so a write
  that repairs it lands.

## One Message is both the request and the fact

Many event-sourced designs separate a command from the events it produces. A
handler reads the command and may answer with different events. Here the
client proposes `CreatedTodo` and the server commits that same Message, or
refuses it. There is no step that answers with other facts.

What only the server may say is a `serverOnly` Message, appended with
`appendAsServer`. Work that follows a commit is a reaction. Both are in
[The server's own writes](./replication.md#the-servers-own-writes-and-work-after-a-commit).

If your domain needs a handler that turns one request into several facts, or
a process that waits, that is a server model of its own and Sync does not
provide it.

## Which folds are entities

Any projection of a fold is a view. It is an entity, something a rule can be
enforced on, when its own state is enough to decide what may happen to it
next. That is the rule for drawing a document:

> A rule can be enforced where one document's snapshot is enough to judge it.

A cap on one list fits, because the list is the document. A username unique
across users does not fit one user's document, because the fact that decides
it is in someone else's.
[Choosing document boundaries](./replication.md#choosing-document-boundaries)
gives three ways to give such a rule an owner.

## What the stored log lets you change

Less than "replay everything through new code" suggests. State the guarantees
narrowly:

- **The local Model** is never stored, so a new build simply folds from
  `initial`.
- **A durable Message's Schema is a stored format.** Operations sit in outboxes
  across a deploy and in the journal for as long as its history is kept.
  Declare the change as a history. See
  [Changing a durable Message](./replication.md#changing-a-durable-message).
- **The slice's own Schema is stored too**, in snapshots and checkpoints, and
  the Message history does not cover it.
- **The journal compacts.** A replica behind the floor adopts a checkpoint,
  which is a result of the fold, not the events. How long history is kept is
  the application's decision.

## Limits

- The local Model has no gate for a view. A Message that should not apply now
  is `update`'s to ignore.
- Remote rows keep no history. If you need one, write it as rows, or edit the
  rows through a journal.
- Nothing here derives new read models from a full event history on demand.

## Background

The idea that a coarse-grained state is a level in its own right only when it
is self-contained is worked out formally in Rosas et al., "Software in the
natural world: A computational approach to hierarchical emergence"
(arXiv:2402.09090). Its closure condition is the one behind "a fact carries
what it means" and behind the document boundary rule.
