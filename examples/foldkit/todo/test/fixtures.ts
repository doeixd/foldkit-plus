import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { type Url, fromString } from 'foldkit/url'

import { EditingState, type Model, initialModel } from '../src/main.js'

export const modelWithTodos: Model = modifyFields(initialModel, {
  todos: () => [
    { id: 'abc', text: 'Buy milk', completed: false, createdAt: 1000 },
    { id: 'def', text: 'Walk the dog', completed: false, createdAt: 2000 },
    { id: 'ghi', text: 'Done task', completed: true, createdAt: 3000 },
  ],
})

export const editingModel: Model = modifyFields(modelWithTodos, {
  editing: () => EditingState.Editing({ id: 'abc', text: 'Buy oat milk' }),
})

export const urlOrThrow = (raw: string): Url =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))
