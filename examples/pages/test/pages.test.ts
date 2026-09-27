// @vitest-environment jsdom
/**
 * Two people on one page. Alice's tab is mounted and edited through its editor; Bob's
 * replica runs the same `update` without a DOM. Their edits meet in the server's order, and
 * Alice's open editor is patched to show Bob's, not mounted afresh.
 */
import { Effect } from 'effect'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { ReplicaId, Sequence, Sync, type Mounted, type Replica, type Storage } from 'foldkit-sync'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialModel, Message, update, type Model, type Shared } from '../src/app.js'
import { mountPages, PagesSync } from '../src/contract.js'
import { openJournal } from '../src/journal.js'
import { view } from '../src/view.js'

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

const open = (id: string): Promise<Replica<Message, Shared>> =>
  Effect.runPromise(PagesSync.openReplica(ReplicaId.make(id), memoryStorage()))

const caretAt = (node: RichText.NodeId, offset: number): RichText.Selection => {
  const at = { node, offset, affinity: 'after' as const }
  return { type: 'Range', anchor: at, focus: at }
}

/** The page's text as the replica's own projection shows it, block by block. */
const textOf = (shared: Shared, id: string): ReadonlyArray<string> => {
  const page = shared.pages.find(candidate => candidate.id === id)
  return (page === undefined ? [] : Replicated.project(page.body).children).map(block =>
    block.children.map(run => run.text).join(''),
  )
}

// The contract's durable set, which its declared `Sync` type does not expose.
const durable = new Set<string>(['CreatedPage', 'RenamedPage', 'DeletedPage', 'EditedPage'])

/**
 * Runs one of Bob's edits through the application's `update` and submits what is durable,
 * the Message itself or the facts it returns, to his replica, as `Sync.mount` would.
 */
const bobEdits = async (
  replica: Replica<Message, Shared>,
  model: Model,
  message: Message,
): Promise<Model> => {
  const result = update(model, message)
  if (durable.has(message._tag)) await Effect.runPromise(replica.submit(message))
  let next = result.model
  for (const command of result.commands ?? []) {
    if (command.name !== 'foldkit-sync/fact') continue
    const fact = Effect.runSync(command.effect)
    next = update(next, fact).model
    await Effect.runPromise(replica.submit(fact))
  }
  return next
}

describe('two people on one page', () => {
  let container: HTMLElement
  let journal: ReturnType<typeof openJournal>
  let alice: Mounted<Model, Message, Shared> | undefined
  const replicas: Array<Replica<Message, Shared>> = []
  const synchronize = (replica: Replica<Message, Shared>, actorId: string) =>
    Effect.runPromise(
      Effect.provide(replica.synchronize, Sync.transport.fromPromise(journal.transport(actorId))),
    )

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    container = document.createElement('div')
    container.id = 'pages'
    document.body.appendChild(container)
    journal = openJournal()
  })
  afterEach(async () => {
    await alice?.dispose()
    alice = undefined
    for (const replica of replicas.splice(0)) await Effect.runPromise(replica.close)
    journal.close()
    container.remove()
    vi.unstubAllGlobals()
  })

  it('sees each other’s typing, in an editor that keeps its host', async () => {
    const aliceReplica = await open('alice')
    const bobReplica = await open('bob')
    replicas.push(aliceReplica, bobReplica)
    alice = mountPages('alice', aliceReplica, { container, view })
    const host = () => document.getElementById('page-body')

    alice.dispatch(Message.AddedPage({ title: 'Plan' }))
    await vi.waitFor(() => expect(host()).not.toBeNull())
    const page = alice.model().open!
    const empty = RichText.blockAtPath(Replicated.project(alice.model().pages[0]!.body), [0])!
      .children[0]!.id
    alice.dispatch(
      Message.GotEditor({ message: EditorMessage.Selected({ selection: caretAt(empty, 0) }) }),
    )
    alice.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: 'Hello' }) }))
    await vi.waitFor(() => expect(host()?.textContent).toBe('Hello'))
    const mounted = host()

    // Alice's edits reach the server, and Bob's replica catches up.
    await synchronize(aliceReplica, 'alice')
    await synchronize(bobReplica, 'bob')
    const bobShared = Effect.runSync(bobReplica.shared)
    expect(textOf(bobShared, page)).toEqual(['Hello'])

    // Bob types after Alice's word, while Alice goes on typing after it too.
    const bobBody = bobShared.pages[0]!.body
    const bobRun = Replicated.project(bobBody).children[0]!.children[0]!.id
    await bobEdits(
      bobReplica,
      {
        ...initialModel('bob'),
        pages: bobShared.pages,
        open: page,
        selection: Replicated.anchor(bobBody, caretAt(bobRun, 5)),
      },
      Message.GotEditor({ message: EditorMessage.Typed({ text: ' world' }) }),
    )
    alice.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: '!' }) }))
    await vi.waitFor(() => expect(host()?.textContent).toBe('Hello!'))

    await synchronize(bobReplica, 'bob')
    await synchronize(aliceReplica, 'alice')
    await synchronize(bobReplica, 'bob')

    // One order, one text, on both replicas and the server: Bob's words committed first,
    // so Alice's later '!' lands right after the 'o' both anchored on.
    const expected = ['Hello! world']
    expect(textOf(journal.snapshot(), page)).toEqual(expected)
    expect(textOf(Effect.runSync(bobReplica.shared), page)).toEqual(expected)
    await vi.waitFor(() => expect(host()?.textContent).toBe(expected[0]))
    // Bob's change was patched into the editor Alice was typing in.
    expect(host()).toBe(mounted)
  })

  /** Alice's tab, with one page open and a caret at the start of its empty paragraph. */
  const aliceOnPage = async (replica: Replica<Message, Shared>) => {
    alice = mountPages('alice', replica, { container, view })
    alice.dispatch(Message.AddedPage({ title: 'Plan' }))
    await vi.waitFor(() => expect(document.getElementById('page-body')).not.toBeNull())
    const body = alice.model().pages[0]!.body
    const empty = Replicated.project(body).children[0]!.children[0]!.id
    alice.dispatch(
      Message.GotEditor({ message: EditorMessage.Selected({ selection: caretAt(empty, 0) }) }),
    )
    return alice
  }

  it('ticks a task, on the page and on the server', async () => {
    const aliceReplica = await open('alice')
    replicas.push(aliceReplica)
    const tab = await aliceOnPage(aliceReplica)
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: 'milk' }) }))
    tab.dispatch(
      Message.GotEditor({
        message: EditorMessage.WrappedBlock({
          containers: [
            { kind: 'List', props: {} },
            { kind: 'TaskItem', props: { checked: false } },
          ],
        }),
      }),
    )
    const task = () => document.querySelector('#page-body [data-task]')
    await vi.waitFor(() => expect(task()?.getAttribute('data-task')).toBe('unchecked'))
    tab.dispatch(Message.ToggledTask())
    await vi.waitFor(() => expect(task()?.getAttribute('data-task')).toBe('checked'))
    await synchronize(aliceReplica, 'alice')
    const stored = Replicated.project(journal.snapshot().pages[0]!.body)
    expect(RichText.blockAtPath(stored, [0, 0])).toMatchObject({
      kind: 'TaskItem',
      props: { checked: true },
    })
  })

  it('closes a page another replica deleted', async () => {
    const aliceReplica = await open('alice')
    const bobReplica = await open('bob')
    replicas.push(aliceReplica, bobReplica)
    const tab = await aliceOnPage(aliceReplica)
    const page = tab.model().open!
    await synchronize(aliceReplica, 'alice')
    await synchronize(bobReplica, 'bob')
    await bobEdits(
      bobReplica,
      { ...initialModel('bob'), pages: Effect.runSync(bobReplica.shared).pages },
      Message.DeletedPage({ id: page }),
    )
    await synchronize(bobReplica, 'bob')
    await synchronize(aliceReplica, 'alice')
    await vi.waitFor(() => expect(tab.model().open).toBeNull())
    await vi.waitFor(() => expect(document.getElementById('page-body')).toBeNull())
  })

  it('rejects an operation that does not decode, and commits the rest of the exchange', async () => {
    const replica = await open('alice')
    replicas.push(replica)
    await Effect.runPromise(
      replica.submit(Message.CreatedPage({ id: 'alice:0', title: 'Kept', key: 'alice:0:seed' })),
    )
    const [valid] = Effect.runSync(replica.pending)
    const malformed = {
      ...valid!,
      opId: 'alice:9',
      message: { _tag: 'EditedPage', id: 'alice:0', ops: 'x' },
    }
    await expect(
      journal.transport('alice').exchange(Sequence.make(0), [
        // @ts-expect-error a client that does not speak the schema: ops that are not an array
        malformed,
        valid!,
      ]),
    ).resolves.toMatchObject({ rejected: ['alice:9'], acknowledged: [valid!.opId] })
    expect(journal.snapshot().pages.map(page => page.title)).toEqual(['Kept'])
  })

  it('refuses a cursor ahead of the server before committing anything', async () => {
    const replica = await open('alice')
    replicas.push(replica)
    await Effect.runPromise(
      replica.submit(Message.CreatedPage({ id: 'alice:0', title: 'Lost', key: 'alice:0:seed' })),
    )
    await expect(
      journal.transport('alice').exchange(Sequence.make(3), Effect.runSync(replica.pending)),
    ).rejects.toThrow('Cursor 3 is ahead of the server')
    expect(journal.snapshot().pages).toEqual([])
  })

  it('starts a page it opens without what the editor carried for the last', () => {
    const carried = { ...initialModel('alice'), storedMarks: ['Bold'], menuIndex: 2 }
    expect(update(carried, Message.OpenedPage({ id: 'other' })).model).toMatchObject({
      open: 'other',
      selection: null,
      storedMarks: null,
      menuIndex: 0,
    })
  })
})
