import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Message, initialModel, syncState, type Model } from '../src/app.js'
import { update } from '../src/surface.js'

const todo = (id: string, createdAt: number) => ({
  id,
  title: `Todo ${id}`,
  completed: false,
  priority: 'normal' as const,
  createdAt,
})

const withTodos = (...ids: ReadonlyArray<string>): Model => ({
  ...initialModel,
  todos: ids.map((id, index) => todo(id, index)),
})

type Result = ReturnType<typeof update>

const names = (result: Result) => (result.commands ?? []).map(command => command.name)

describe('deleting with an undo', () => {
  it('keeps the todo to offer back, deletes it by a fact, and expires the offer', () => {
    const result = update(withTodos('a', 'b'), Message.DeleteRequested({ id: 'a' }))
    expect(Option.map(result.model.undo, ({ id }) => id)).toEqual(Option.some('a'))
    expect(names(result)).toEqual(['foldkit-sync/fact', 'Focus', 'ExpireUndo'])
    // The todo leaves through the durable fact, not through the intent.
    expect(result.model.todos).toHaveLength(2)
  })

  it('does nothing for a todo that is already gone', () => {
    const model = withTodos('a')
    expect(update(model, Message.DeleteRequested({ id: 'zzz' })).model).toBe(model)
  })

  it('undo restores the todo as it was, once, and clears the offer', () => {
    const deleted = update(withTodos('a', 'b'), Message.DeleteRequested({ id: 'a' })).model
    const gone = update(deleted, Message.DeletedTodo({ id: 'a' })).model
    const undone = update(gone, Message.UndoRequested())
    expect(Option.isNone(undone.model.undo)).toBe(true)
    expect(names(undone)).toEqual(['foldkit-sync/fact', 'Focus'])
    const restored = update(undone.model, Message.RestoredTodo({ todo: todo('a', 0) })).model
    expect(restored.todos.map(({ id }) => id)).toEqual(['b', 'a'])
    // A retry of the same fact puts nothing back twice and hands back the Model it was given.
    expect(update(restored, Message.RestoredTodo({ todo: todo('a', 0) })).model).toBe(restored)
  })

  it('an undo with nothing to offer is a no-op', () => {
    expect(update(initialModel, Message.UndoRequested()).model).toBe(initialModel)
  })

  it('an expiry clears only the offer it was made for', () => {
    const first = update(withTodos('a', 'b'), Message.DeleteRequested({ id: 'a' })).model
    const second = update(first, Message.DeleteRequested({ id: 'b' })).model
    // The first delete's timer fires after the second delete replaced the offer.
    expect(update(second, Message.UndoExpired({ id: 'a' })).model).toBe(second)
    expect(Option.isNone(update(second, Message.UndoExpired({ id: 'b' })).model.undo)).toBe(true)
  })
})

describe('where focus goes', () => {
  it('Enter in the editor commits and returns focus to the title; blur only commits', () => {
    const editing = update(withTodos('a'), Message.EditingStarted({ id: 'a' })).model
    const typed = update(editing, Message.EditDraftChanged({ value: 'Renamed' })).model
    expect(names(update(typed, Message.EditingSubmitted()))).toEqual(['Rename', 'Focus'])
    expect(names(update(typed, Message.EditingCommitted()))).toEqual(['Rename'])
  })

  it('Escape returns focus to the title only while an edit is open', () => {
    const editing = update(withTodos('a'), Message.EditingStarted({ id: 'a' })).model
    expect(names(update(editing, Message.EditingStopped()))).toEqual(['Focus'])
    expect(names(update(initialModel, Message.EditingStopped()))).toEqual([])
  })
})

describe('the connection strip', () => {
  it('says offline first, then retrying, then saving, then synced', () => {
    const state = (patch: Partial<Model>) => syncState({ ...initialModel, ...patch })
    expect(state({})).toBe('synced')
    expect(state({ pending: 2 })).toBe('saving')
    expect(state({ pending: 2, syncFailed: true })).toBe('retrying')
    expect(state({ pending: 2, syncFailed: true, offline: true })).toBe('offline')
  })

  it('a status or switch that changes nothing hands back the Model it was given', () => {
    const model = update(
      initialModel,
      Message.SyncStatusChanged({ pending: 3, failed: false }),
    ).model
    expect(model.pending).toBe(3)
    expect(update(model, Message.SyncStatusChanged({ pending: 3, failed: false })).model).toBe(
      model,
    )
    const offline = update(model, Message.OfflineSet({ offline: true })).model
    expect(offline.offline).toBe(true)
    expect(update(offline, Message.OfflineSet({ offline: true })).model).toBe(offline)
  })
})
