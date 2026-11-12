/**
 * The two mirrors at start and on a URL: the list is bootstrapped from this
 * device's store, the filter read from the link by `Mirror.routing`.
 */
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { FilterMirror, Message, TodosMirror, init, initialModel, update } from '../src/main.js'
import { modelWithTodos, urlOrThrow } from './fixtures.js'

const flags = { todos: TodosMirror.encode(modelWithTodos) }
const at = (path: string) => urlOrThrow(`http://localhost${path}`)

describe('the filter in the URL beside the stored list', () => {
  test('init takes the list from the store and the filter from the URL', () => {
    const { model } = init(flags, at('/?filter=Active'))
    expect(model.todos).toStrictEqual(modelWithTodos.todos)
    expect(model.filter).toBe('Active')
  })

  test('a URL without the key, or with a filter it does not know, shows All', () => {
    expect(init(flags, at('/')).model.filter).toBe('All')
    expect(init(flags, at('/?filter=Someday')).model.filter).toBe('All')
  })

  test('All is left out of a link', () => {
    expect(FilterMirror.href(initialModel, {}, '/')).toBe('/')
    expect(FilterMirror.href(initialModel, { filter: 'Completed' }, '/')).toBe('/?filter=Completed')
  })

  test('back or forward to another filter reads it', () => {
    const { model } = init(flags, at('/'))
    const next = update(model, Message.ChangedUrl({ url: at('/?filter=Completed') })).model
    expect(next.filter).toBe('Completed')
    expect(next.todos).toBe(model.todos)
  })

  test('a URL that leaves the filter as read changes nothing, not even identity', () => {
    const { model } = init(flags, at('/?filter=Active'))
    const edited = modifyFields(model, { newTodoText: () => 'Milk' })
    expect(update(edited, Message.ChangedUrl({ url: at('/?filter=Active') })).model).toBe(edited)
  })
})
