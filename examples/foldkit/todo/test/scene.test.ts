import {
  Command,
  click,
  expect,
  given,
  label,
  role,
  scene,
  submit,
  text,
  type,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { EditingState, GenerateTodo, Message, type Model, update, view } from '../src/main.js'

const emptyModel: Model = {
  todos: [],
  newTodoText: '',
  filter: 'All',
  editing: EditingState.NotEditing(),
}

const modelWithTodos: Model = modifyFields(emptyModel, {
  todos: () => [
    { id: 'abc', text: 'Buy milk', completed: false, createdAt: 1000 },
    { id: 'def', text: 'Walk the dog', completed: false, createdAt: 2000 },
    { id: 'ghi', text: 'Done task', completed: true, createdAt: 3000 },
  ],
})

describe('view', () => {
  test('empty state shows heading and placeholder message', () => {
    scene(
      { update, view },
      given(emptyModel),
      expect(role('heading', { name: 'Todo App' })).toExist(),
      expect(text('No todos yet. Add one above!')).toExist(),
    )
  })

  test('renders existing todos', () => {
    scene(
      { update, view },
      given(modelWithTodos),
      expect(text('Buy milk')).toExist(),
      expect(text('Walk the dog')).toExist(),
      expect(text('Done task')).toExist(),
      expect(role('status')).toContainText('2 active, 1 completed'),
    )
  })

  test('add a todo through the form', () => {
    scene(
      { update, view },
      given(emptyModel),
      type(label('New todo'), 'Write tests'),
      submit(role('form')),
      Command.expectExact(GenerateTodo),
      Command.resolve(
        GenerateTodo,
        Message.CompletedGenerateTodo({
          id: 'new-1',
          timestamp: 5000,
          text: 'Write tests',
        }),
      ),
      expect(text('Write tests')).toExist(),
      expect(label('New todo')).toHaveValue(''),
    )
  })

  test('toggle a todo by clicking its checkbox', () => {
    scene(
      { update, view },
      given(modelWithTodos),
      click(label('Buy milk')),
      expect(role('status')).toContainText('1 active, 2 completed'),
    )
  })

  test('delete a todo', () => {
    scene(
      { update, view },
      given(modelWithTodos),
      click(role('button', { name: 'Delete Buy milk' })),
      expect(text('Buy milk')).toBeAbsent(),
      expect(text('Walk the dog')).toExist(),
    )
  })

  test('clear completed removes done todos', () => {
    scene(
      { update, view },
      given(modelWithTodos),
      click(role('button', { name: 'Clear 1 completed' })),
      expect(text('Done task')).toBeAbsent(),
      expect(role('status')).toContainText('2 active, 0 completed'),
    )
  })

  test('mark all complete toggles all todos', () => {
    scene(
      { update, view },
      given(modelWithTodos),
      click(role('button', { name: 'Mark all complete' })),
      expect(role('status')).toContainText('0 active, 3 completed'),
    )
  })
})
