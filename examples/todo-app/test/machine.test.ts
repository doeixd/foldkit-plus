// @vitest-environment jsdom
/**
 * The declared writes of `src/machine.ts`: every Message of the application is
 * run through `WritesCheck.verify`, and the Foldkit runtime shows that a Message
 * draws again only the Surfaces that read a field it is declared to write.
 */
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { fromString } from 'foldkit/url'
import { WritesCheck, type WriteDiagnostic } from 'foldkit-surface/writes'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialModel, Message, Model } from '../src/app.js'
import {
  Board,
  Composer,
  Connection,
  Footer,
  Header,
  assembled,
  update,
  writes,
} from '../src/surface.js'
import '../src/view.js'

// The views `view.ts` defined, before this file defines counting ones.
const appRegions = [...writes.regions()]

const url = Option.getOrThrow(fromString('http://localhost/todos?filter=active'))
const milk = { id: 'b', title: 'Eggs', completed: false, priority: 'high', createdAt: 2 } as const

/** One of every Message, in an order that gives each its turn on a Model it changes. */
const everyMessage: ReadonlyArray<Message> = [
  Message.SubmittedTodo({ id: 'a', title: 'Milk', createdAt: 1 }),
  Message.SubmittedTodo({ id: 'b', title: 'Eggs', createdAt: 2 }),
  Message.DraftChanged({ value: 'Bread' }),
  Message.DraftSubmitted(),
  Message.RequestedTodo({ title: 'Tea', requestId: 'call-1' }),
  Message.EditingStarted({ id: 'a' }),
  Message.EditDraftChanged({ value: 'Oat milk' }),
  Message.EditingCommitted(),
  Message.EditingStarted({ id: 'b' }),
  Message.EditingSubmitted(),
  Message.EditingStarted({ id: 'a' }),
  Message.EditingStopped(),
  Message.RenamedTodo({ id: 'a', title: 'Oat milk' }),
  Message.ToggledTodo({ id: 'a' }),
  Message.PrioritySet({ id: 'b', priority: 'high' }),
  Message.DeleteRequested({ id: 'b' }),
  Message.UndoRequested(),
  Message.DeleteRequested({ id: 'a' }),
  Message.UndoExpired({ id: 'a' }),
  Message.DeletedTodo({ id: 'b' }),
  Message.RestoredTodo({ todo: milk }),
  Message.ClearedCompleted(),
  Message.RenamedList({ title: 'Groceries' }),
  Message.FilterSelected({ filter: 'completed' }),
  Message.OfflineSet({ offline: true }),
  Message.SyncStatusChanged({ pending: 2, failed: true }),
  Message.CompletedFocus(),
  Message.UrlChanged({ url }),
  Message.MirrorRestored({ name: 'todo/prefs', keys: { draft: 'Restored' } }),
]

/** Every tag of the application's Messages: a new one does not compile until it is here. */
const tags = {
  UrlChanged: true,
  MirrorRestored: true,
  DraftSubmitted: true,
  RequestedTodo: true,
  EditingCommitted: true,
  EditingSubmitted: true,
  DeleteRequested: true,
  UndoRequested: true,
  SubmittedTodo: true,
  ToggledTodo: true,
  RenamedTodo: true,
  PrioritySet: true,
  DeletedTodo: true,
  RestoredTodo: true,
  ClearedCompleted: true,
  RenamedList: true,
  DraftChanged: true,
  FilterSelected: true,
  EditingStarted: true,
  EditDraftChanged: true,
  EditingStopped: true,
  UndoExpired: true,
  OfflineSet: true,
  SyncStatusChanged: true,
  CompletedFocus: true,
} satisfies Record<Message['_tag'], true>

describe('declared writes', () => {
  it('no Message of the application changes a field its Transition does not declare', () => {
    expect(new Set(everyMessage.map(message => message._tag))).toEqual(new Set(Object.keys(tags)))
    const found: Array<WriteDiagnostic> = []
    const checked = WritesCheck.verify(writes, assembled, { report: found.push.bind(found) })
    let model = initialModel
    for (const message of everyMessage) model = checked(model, message).model
    expect(found).toEqual([])
    // The list reached the states it was written for.
    expect(model).toMatchObject({
      listTitle: 'Groceries',
      filter: 'active',
      draft: 'Restored',
      offline: true,
      pending: 2,
      syncFailed: true,
    })
  })

  it('reports a Message that changes more than its Transition declares', () => {
    const found: Array<WriteDiagnostic> = []
    const lying = WritesCheck.verify(
      writes,
      (model: Model, message: Message) => ({
        model: { ...assembled(model, message).model, listTitle: 'Sneaked' },
      }),
      { report: found.push.bind(found) },
    )
    lying(initialModel, Message.DraftChanged({ value: 'x' }))
    expect(found.map(({ _tag }) => _tag)).toEqual(['UndeclaredWrite'])
  })

  it('declares each transition to write its own fields', () => {
    expect(writes.declared(Message.DraftChanged({ value: 'x' }))).toEqual(Option.some([['draft']]))
    expect(writes.declared(Message.CompletedFocus())).toEqual(Option.some([]))
    expect(writes.declared(Message.SyncStatusChanged({ pending: 1, failed: false }))).toEqual(
      Option.some([['pending'], ['syncFailed']]),
    )
    // No Transition: nothing is known of what it writes.
    expect(writes.declared(Message.ToggledTodo({ id: 'a' }))).toEqual(Option.none())
  })

  it('matches each Surface of the page to the Messages declared to write what it reads', () => {
    expect(appRegions.map(region => [region.name, region.redrawnBy])).toEqual([
      ['Header', []],
      ['Composer', ['DraftChanged']],
      [
        'Board',
        [
          'FilterSelected',
          'EditDraftChanged',
          'EditingCommitted',
          'EditingSubmitted',
          'EditingStopped',
        ],
      ],
      ['Connection', ['OfflineSet', 'SyncStatusChanged']],
      ['Footer', ['UndoRequested']],
    ])
  })

  it('ends an edit only where one is going on', () => {
    const withTodo = update(
      initialModel,
      Message.SubmittedTodo({ id: 'a', title: 'Milk', createdAt: 1 }),
    ).model
    const editing = update(withTodo, Message.EditingStarted({ id: 'a' })).model
    expect(editing).toMatchObject({ editingId: Option.some('a'), editDraft: 'Milk' })
    for (const end of [Message.EditingCommitted(), Message.EditingSubmitted()]) {
      expect(update(editing, end).model).toMatchObject({
        editingId: Option.none(),
        editDraft: '',
      })
    }
    // With nothing edited a stray draft is left alone, which `EditingStopped` clears.
    const stray = { ...initialModel, editDraft: 'stray' }
    expect(update(stray, Message.EditingCommitted()).model).toBe(stray)
    expect(update(stray, Message.EditingStopped()).model.editDraft).toBe('')
  })

  it('hands back the Model it was given where a declared Message changes nothing', () => {
    expect(update(initialModel, Message.EditingCommitted()).model).toBe(initialModel)
    expect(update(initialModel, Message.EditingSubmitted()).model).toBe(initialModel)
    expect(update(initialModel, Message.UndoRequested()).model).toBe(initialModel)
    expect(update(initialModel, Message.OfflineSet({ offline: false })).model).toBe(initialModel)
    expect(
      update(initialModel, Message.SyncStatusChanged({ pending: 0, failed: false })).model,
    ).toBe(initialModel)
    expect(update(initialModel, Message.DraftChanged({ value: '' })).model).toBe(initialModel)
    expect(update(initialModel, Message.RequestedTodo({ title: 'Tea' })).model).toBe(initialModel)
    expect(update(initialModel, Message.CompletedFocus()).model).toBe(initialModel)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('what a Message draws again', () => {
  it('draws only the Surfaces that read a field it declares, and all for a Message with no Transition', async () => {
    const draws = { Header: 0, Composer: 0, Board: 0, Connection: 0, Footer: 0 }
    const header = writes.rootView(Header, undefined, ({ listTitle }, h) => {
      draws.Header++
      return h.p([h.Id('header')], [listTitle])
    })
    const composer = writes.rootView(Composer, undefined, ({ draft }, h) => {
      draws.Composer++
      return h.p([h.Id('composer')], [draft])
    })
    const board = writes.rootView(Board, undefined, ({ filter }, h) => {
      draws.Board++
      return h.p([h.Id('board')], [filter])
    })
    const connection = writes.rootView(Connection, undefined, ({ offline }, h) => {
      draws.Connection++
      return h.p([h.Id('connection')], [String(offline)])
    })
    const footer = writes.rootView(Footer, undefined, ({ todos }, h) => {
      draws.Footer++
      return h.p([h.Id('footer')], [String(todos.length)])
    })
    const senders = {
      typed: Message.DraftChanged({ value: 'Bread' }),
      filtered: Message.FilterSelected({ filter: 'active' }),
      renamed: Message.RenamedList({ title: 'Groceries' }),
    }
    const container = document.createElement('div')
    container.id = 'todo-machine'
    document.body.appendChild(container)
    // Frames run on a timer, as jsdom has none.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        init: () => ({ model: initialModel }),
        update: (state: Model, message: Message) => ({
          model: update(state, message).model,
          commands: [],
        }),
        view: (state: Model, h: HtmlBuilder<Message>) =>
          h.div(
            [],
            [
              header(state, h),
              composer(state, h),
              board(state, h),
              connection(state, h),
              footer(state, h),
              ...Object.entries(senders).map(([id, message]) =>
                h.button([h.Id(id), h.OnClick(message)], [id]),
              ),
            ],
          ),
      }),
    )
    const text = (id: string) => document.getElementById(id)?.textContent
    const press = (id: string) => document.getElementById(id)?.click()
    try {
      await vi.waitFor(() => expect(text('header')).toBe('Todos'))
      expect(draws).toEqual({ Header: 1, Composer: 1, Board: 1, Connection: 1, Footer: 1 })

      // The draft is the Composer's alone.
      press('typed')
      await vi.waitFor(() => expect(text('composer')).toBe('Bread'))
      expect(draws).toEqual({ Header: 1, Composer: 2, Board: 1, Connection: 1, Footer: 1 })

      // The filter is the Board's alone.
      press('filtered')
      await vi.waitFor(() => expect(text('board')).toBe('active'))
      expect(draws).toEqual({ Header: 1, Composer: 2, Board: 2, Connection: 1, Footer: 1 })

      // `RenamedList` keeps its hand-written arm: nothing is known of what it writes.
      press('renamed')
      await vi.waitFor(() => expect(text('header')).toBe('Groceries'))
      expect(draws).toEqual({ Header: 2, Composer: 3, Board: 3, Connection: 2, Footer: 2 })
    } finally {
      handle.dispose()
    }
  })
})
