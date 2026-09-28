/**
 * Two replicas edit one page at once, offline from each other, through the application's
 * own `update`; the journal puts their edits in one order and both end with the same page.
 * Run with `pnpm demo`.
 */
import { strict as assert } from 'node:assert'
import { Effect } from 'effect'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { print } from 'foldkit-richtext-markdown'
import { ReplicaId, Sync, type Replica, type Storage } from 'foldkit-sync'
import { initialModel, Message, update, type Model, type Shared } from './app.js'
import { PagesSync } from './contract.js'
import { openJournal } from './journal.js'

const { Replicated } = RichText

const memoryStorage = (): Storage => {
  let state: unknown
  return {
    load: () => Effect.sync(() => state),
    save: next =>
      Effect.sync(() => {
        state = structuredClone(next)
      }),
    close: Effect.void,
  }
}

/** One person: a replica, and the Model their tab would hold. */
interface Person {
  readonly name: string
  readonly replica: Replica<Message, Shared>
  model: Model
}

const person = async (name: string): Promise<Person> => ({
  name,
  replica: await Effect.runPromise(PagesSync.openReplica(ReplicaId.make(name), memoryStorage())),
  model: initialModel(name),
})

/** Dispatches as `Sync.mount` would: the Message, then the facts it returns, persisting what is durable. */
const dispatch = async (who: Person, message: Message): Promise<void> => {
  const result = update(who.model, message)
  if (PagesSync.durable(message)) await Effect.runPromise(who.replica.submit(message))
  who.model = result.model
  for (const command of result.commands ?? []) {
    if (command.name !== 'foldkit-sync/fact') continue
    const fact = Effect.runSync(command.effect)
    who.model = update(who.model, fact).model
    await Effect.runPromise(who.replica.submit(fact))
  }
}

const journal = openJournal()

/** One exchange, then the shared pages installed, as the mount's refresh does. */
const synchronize = async (who: Person): Promise<void> => {
  await Effect.runPromise(
    Effect.provide(
      who.replica.synchronize,
      Sync.transport.fromPromise(journal.transport(who.name)),
    ),
  )
  who.model = { ...who.model, pages: Effect.runSync(who.replica.shared).pages }
}

const typed = (text: string) => Message.GotEditor({ message: EditorMessage.Typed({ text }) })
const pressed = (message: EditorMessage) => Message.GotEditor({ message })

/** Puts the caret after the `offset`th character of the open page's `block`th block. */
const caret = (who: Person, block: number, offset: number): Promise<void> => {
  const body = who.model.pages.find(page => page.id === who.model.open)!.body
  const run = RichText.blockAtPath(Replicated.project(body), [block])!.children[0]!.id
  const at = { node: run, offset, affinity: 'after' as const }
  return dispatch(
    who,
    pressed(EditorMessage.Selected({ selection: { type: 'Range', anchor: at, focus: at } })),
  )
}

const markdownOf = (who: Person): string => {
  const page = who.model.pages.find(candidate => candidate.id === who.model.open)!
  return print(Replicated.project(page.body)).markdown
}

const alice = await person('alice')
const bob = await person('bob')

// Alice starts a page and writes its first lines.
await dispatch(alice, Message.AddedPage({ title: 'Launch plan' }))
await caret(alice, 0, 0)
await dispatch(alice, typed('Launch checklist'))
await dispatch(alice, pressed(EditorMessage.RetypedBlock({ block: { type: 'Heading', level: 1 } })))
await dispatch(alice, pressed(EditorMessage.Entered()))
await dispatch(alice, typed('Ship the editor'))
await synchronize(alice)

// Bob opens it, and both edit without seeing each other.
await synchronize(bob)
await dispatch(bob, Message.OpenedPage({ id: alice.model.open! }))
await caret(bob, 1, 15)
await dispatch(bob, pressed(EditorMessage.Entered()))
await dispatch(bob, typed('Write the announcement'))
await dispatch(
  bob,
  pressed(
    EditorMessage.WrappedBlock({
      containers: [
        { kind: 'List', props: {} },
        { kind: 'TaskItem', props: { checked: false } },
      ],
    }),
  ),
)
await caret(alice, 1, 4)
await dispatch(alice, typed(' and test'))
await dispatch(alice, Message.RenamedPage({ id: alice.model.open!, title: 'Launch plan (v2)' }))

console.log('Before they exchange:\n')
console.log(`alice:\n${markdownOf(alice)}`)
console.log(`bob:\n${markdownOf(bob)}`)

// Bob reaches the server first, so his edits come first in its order.
await synchronize(bob)
await synchronize(alice)
await synchronize(bob)

console.log('After they exchange:\n')
console.log(markdownOf(alice))
assert.equal(markdownOf(alice), markdownOf(bob))
assert.equal(
  markdownOf(alice),
  '# Launch checklist\n\nShip and test the editor\n\n- [ ] Write the announcement\n',
)
assert.equal(alice.model.pages[0]!.title, 'Launch plan (v2)')
assert.deepEqual(alice.model.pages, bob.model.pages)
assert.deepEqual(journal.snapshot().pages, alice.model.pages)
console.log('Both replicas and the server agree.')
journal.close()
