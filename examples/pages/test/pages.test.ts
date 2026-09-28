// @vitest-environment jsdom
/**
 * Two people on one page. Alice's tab is mounted and edited through its editor; Bob's
 * replica runs the same `update` without a DOM. Their edits meet in the server's order, and
 * Alice's open editor is patched to show Bob's, not mounted afresh.
 */
import { Effect, Schema } from 'effect'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { ReplicaId, Sequence, Sync, type Mounted, type Replica, type Storage } from 'foldkit-sync'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialModel, Message, pageOf, update, type Model, type Shared } from '../src/app.js'
import { mountPages, PagesSync } from '../src/contract.js'
import { openJournal } from '../src/journal.js'
import { view } from '../src/view.js'

const { Replicated } = RichText
const decodeMessage = Schema.decodeUnknownSync(Message)

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
  if (PagesSync.durable(message)) await Effect.runPromise(replica.submit(message))
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

  const titles = (shared: Shared) => shared.pages.map(page => page.title)

  it('rebuilds on a server that lost its history, and delivers what was waiting', async () => {
    const replica = await open('bob')
    replicas.push(replica)
    const model = await bobEdits(replica, initialModel('bob'), Message.AddedPage({ title: 'Old' }))
    await synchronize(replica, 'bob')
    await bobEdits(replica, model, Message.AddedPage({ title: 'New' }))
    // The server starts again from an empty database, behind the replica's cursor.
    journal.close()
    journal = openJournal()
    await synchronize(replica, 'bob')
    // What only the old server held is gone; the edit that was waiting is not.
    expect(titles(journal.snapshot())).toEqual(['New'])
    expect(titles(Effect.runSync(replica.shared))).toEqual(['New'])
    expect(Effect.runSync(replica.pending)).toEqual([])
  })

  it('refuses one tab’s edits sent under another’s replica', async () => {
    const replica = await open('bob')
    replicas.push(replica)
    const model = await bobEdits(replica, initialModel('bob'), Message.AddedPage({ title: 'A' }))
    await synchronize(replica, 'bob')
    await bobEdits(replica, model, Message.AddedPage({ title: 'B' }))
    const [waiting] = Effect.runSync(replica.pending)
    await synchronize(replica, 'mallory')
    expect(Effect.runSync(replica.status).rejected).toEqual([waiting!.opId])
    expect(titles(journal.snapshot())).toEqual(['A'])
  })

  it('sends a burst of typing the server has not seen as one operation', async () => {
    const aliceReplica = await open('alice')
    replicas.push(aliceReplica)
    const tab = await aliceOnPage(aliceReplica)
    for (const text of ['H', 'i', '!'])
      tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text }) }))
    await vi.waitFor(() => expect(document.getElementById('page-body')?.textContent).toBe('Hi!'))
    // The page's creation, then one edit holding all three keystrokes as one insert.
    await vi.waitFor(() =>
      expect(
        Effect.runSync(aliceReplica.pending).map(op => decodeMessage(op.message)._tag),
      ).toEqual(['CreatedPage', 'EditedPage']),
    )
    const edited = decodeMessage(Effect.runSync(aliceReplica.pending)[1]!.message)
    expect(edited._tag === 'EditedPage' && edited.ops).toMatchObject([
      { type: 'Insert', text: 'Hi!' },
    ])
    await synchronize(aliceReplica, 'alice')
    expect(textOf(journal.snapshot(), tab.model().open!)).toEqual(['Hi!'])
  })

  it('undoes only this tab’s typing, keeping what someone else typed meanwhile', async () => {
    const aliceReplica = await open('alice')
    const bobReplica = await open('bob')
    replicas.push(aliceReplica, bobReplica)
    const tab = await aliceOnPage(aliceReplica)
    const page = tab.model().open!
    const body = () => document.getElementById('page-body')?.textContent
    for (const text of ['H', 'i'])
      tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text }) }))
    await vi.waitFor(() => expect(body()).toBe('Hi'))
    await synchronize(aliceReplica, 'alice')
    await synchronize(bobReplica, 'bob')
    // Bob adds to the end of Alice's word.
    const bobShared = Effect.runSync(bobReplica.shared)
    const bobBody = bobShared.pages[0]!.body
    const bobRun = Replicated.project(bobBody).children[0]!.children[0]!.id
    await bobEdits(
      bobReplica,
      {
        ...initialModel('bob'),
        pages: bobShared.pages,
        open: page,
        selection: Replicated.anchor(bobBody, caretAt(bobRun, 2)),
      },
      Message.GotEditor({ message: EditorMessage.Typed({ text: ' there' }) }),
    )
    await synchronize(bobReplica, 'bob')
    await synchronize(aliceReplica, 'alice')
    await vi.waitFor(() => expect(body()).toBe('Hi there'))

    // Alice's two keystrokes were one step: undo takes both, and only them.
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Undone() }))
    await vi.waitFor(() => expect(body()).toBe(' there'))
    await synchronize(aliceReplica, 'alice')
    expect(textOf(journal.snapshot(), page)).toEqual([' there'])

    tab.dispatch(Message.GotEditor({ message: EditorMessage.Redone() }))
    await vi.waitFor(() => expect(body()).toBe('Hi there'))
    await synchronize(aliceReplica, 'alice')
    await synchronize(bobReplica, 'bob')
    expect(textOf(Effect.runSync(bobReplica.shared), page)).toEqual(['Hi there'])
  })

  it('keeps typing on one page and on the next apart', async () => {
    const aliceReplica = await open('alice')
    replicas.push(aliceReplica)
    const tab = await aliceOnPage(aliceReplica)
    const first = tab.model().open!
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: 'one' }) }))
    tab.dispatch(Message.AddedPage({ title: 'Second' }))
    await vi.waitFor(() => expect(tab.model().open).not.toBe(first))
    const empty = Replicated.project(pageOf(tab.model(), tab.model().open)!.body).children[0]!
      .children[0]!.id
    tab.dispatch(
      Message.GotEditor({ message: EditorMessage.Selected({ selection: caretAt(empty, 0) }) }),
    )
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: 'two' }) }))
    await vi.waitFor(() => expect(document.getElementById('page-body')?.textContent).toBe('two'))
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Undone() }))
    await vi.waitFor(() => expect(document.getElementById('page-body')?.textContent).toBe(''))
    expect(textOf(tab.model(), first)).toEqual(['one'])
    // The first page's typing is still a step of its own, on that page.
    tab.dispatch(Message.OpenedPage({ id: first }))
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Undone() }))
    await vi.waitFor(() => expect(textOf(tab.model(), first)).toEqual(['']))
  })

  it('undoes a change of block apart from the typing before it', async () => {
    const aliceReplica = await open('alice')
    replicas.push(aliceReplica)
    const tab = await aliceOnPage(aliceReplica)
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: 'Title' }) }))
    tab.dispatch(
      Message.GotEditor({
        message: EditorMessage.RetypedBlock({ block: { type: 'Heading', level: 1 } }),
      }),
    )
    tab.dispatch(
      Message.GotEditor({
        message: EditorMessage.RetypedBlock({ block: { type: 'Heading', level: 2 } }),
      }),
    )
    await vi.waitFor(() => expect(document.querySelector('#page-body h2')).not.toBeNull())
    // Each change of block is a step of its own, apart from the other and from the typing.
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Undone() }))
    await vi.waitFor(() => expect(document.querySelector('#page-body h1')).not.toBeNull())
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Undone() }))
    await vi.waitFor(() => expect(document.querySelector('#page-body h1')).toBeNull())
    expect(document.getElementById('page-body')?.textContent).toBe('Title')
    // A new edit after an undo leaves nothing to redo.
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: '!' }) }))
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Redone() }))
    await vi.waitFor(() => expect(document.getElementById('page-body')?.textContent).toBe('Title!'))
    expect(document.querySelector('#page-body h1, #page-body h2')).toBeNull()
  })

  it('draws where someone else is, and keeps it by their characters as the text changes', async () => {
    const aliceReplica = await open('alice')
    replicas.push(aliceReplica)
    const tab = await aliceOnPage(aliceReplica)
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: 'Hello' }) }))
    await vi.waitFor(() => expect(document.getElementById('page-body')?.textContent).toBe('Hello'))
    const page = tab.model().open!
    const body = pageOf(tab.model(), page)!.body
    const run = Replicated.project(body).children[0]!.children[0]!.id
    // Bob's caret is after 'He', as his presence reports it.
    tab.dispatch(
      Message.GotPeers({
        peers: [
          { id: 'bob', name: 'Bob', page, selection: Replicated.anchor(body, caretAt(run, 2)) },
        ],
      }),
    )
    const caret = () => document.querySelector('#page-body [data-decoration="peer"]')?.textContent
    await vi.waitFor(() => expect(caret()).toBe('e'))
    // Alice types before it; Bob's caret stays after the same 'e'.
    const start = Replicated.project(pageOf(tab.model(), page)!.body).children[0]!.children[0]!.id
    tab.dispatch(
      Message.GotEditor({ message: EditorMessage.Selected({ selection: caretAt(start, 0) }) }),
    )
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: '>' }) }))
    await vi.waitFor(() => expect(document.getElementById('page-body')?.textContent).toBe('>Hello'))
    expect(caret()).toBe('e')
    // A peer on another page draws nothing here, though its anchors would resolve here.
    const now = pageOf(tab.model(), page)!.body
    tab.dispatch(
      Message.GotPeers({
        peers: [
          {
            id: 'bob',
            name: 'Bob',
            page: 'elsewhere',
            selection: Replicated.anchor(
              now,
              caretAt(Replicated.project(now).children[0]!.children[0]!.id, 2),
            ),
          },
        ],
      }),
    )
    await vi.waitFor(() => expect(caret()).toBeUndefined())
  })

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

  it('keeps typing into a page someone else deleted, for a restore to bring back', async () => {
    const aliceReplica = await open('alice')
    const bobReplica = await open('bob')
    replicas.push(aliceReplica, bobReplica)
    const tab = await aliceOnPage(aliceReplica)
    const page = tab.model().open!
    await synchronize(aliceReplica, 'alice')
    await synchronize(bobReplica, 'bob')
    // Alice types while Bob deletes the page; Bob's delete reaches the server first.
    tab.dispatch(Message.GotEditor({ message: EditorMessage.Typed({ text: 'kept' }) }))
    await vi.waitFor(() => expect(document.getElementById('page-body')?.textContent).toBe('kept'))
    await bobEdits(
      bobReplica,
      { ...initialModel('bob'), pages: Effect.runSync(bobReplica.shared).pages },
      Message.DeletedPage({ id: page }),
    )
    await synchronize(bobReplica, 'bob')
    await synchronize(aliceReplica, 'alice')
    await vi.waitFor(() => expect(document.getElementById('page-body')).toBeNull())
    expect(journal.snapshot().pages[0]).toMatchObject({ id: page, trashed: true })
    expect(textOf(journal.snapshot(), page)).toEqual(['kept'])

    tab.dispatch(Message.RestoredPage({ id: page }))
    tab.dispatch(Message.OpenedPage({ id: page }))
    await vi.waitFor(() => expect(document.getElementById('page-body')?.textContent).toBe('kept'))
    await synchronize(aliceReplica, 'alice')
    expect(journal.snapshot().pages[0]?.trashed).toBeUndefined()
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

  it('announces each commit, so a tab that only reads hears of it', async () => {
    const replica = await open('alice')
    replicas.push(replica)
    let heard = 0
    const unsubscribe = journal.subscribe(() => (heard += 1))
    await Effect.runPromise(
      replica.submit(Message.CreatedPage({ id: 'alice:0', title: 'Plan', key: 'alice:0:seed' })),
    )
    await synchronize(replica, 'alice')
    await vi.waitFor(() => expect(heard).toBe(1))
    unsubscribe()
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
