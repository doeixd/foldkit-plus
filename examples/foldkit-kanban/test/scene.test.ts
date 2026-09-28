import { Option } from 'effect'
import {
  Command,
  click,
  expect,
  given,
  inside,
  label,
  role,
  scene,
  submit,
  text,
  type,
  within,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import * as DragAndDrop from '@foldkit/ui/dragAndDrop'

import { FocusAddCardInput, GenerateCardId } from '../src/command.js'
import type { Card } from '../src/domain/card.js'
import type { Column } from '../src/domain/column.js'
import { Message } from '../src/message.js'
import type { Model } from '../src/model.js'
import { update } from '../src/update.js'
import { view } from '../src/view/index.js'

const card = (id: string, title: string, sortKey: string): Card => ({
  id,
  title,
  description: '',
  sortKey,
})

const testColumns: ReadonlyArray<Column> = [
  {
    id: 'todo',
    name: 'To Do',
    cards: [card('1', 'Write tests', 'a0'), card('2', 'Fix bug', 'a1')],
  },
  {
    id: 'in-progress',
    name: 'In Progress',
    cards: [card('3', 'Review PR', 'a0')],
  },
  { id: 'done', name: 'Done', cards: [] },
]

const testModel: Model = {
  columns: testColumns,
  dragAndDrop: DragAndDrop.init({ id: 'kanban' }),
  maybeNewCardColumnId: Option.none(),
  newCardTitle: '',
  announcement: '',
}

const toDoColumn = role('region', { name: 'To Do' })
const inProgressColumn = role('region', { name: 'In Progress' })
const doneColumn = role('region', { name: 'Done' })

const acknowledgeFocusInput = Command.resolve(
  FocusAddCardInput,
  Message.CompletedFocusAddCardInput(),
)

describe('view', () => {
  test('board renders columns with correct names', () => {
    scene(
      { update, view },
      given(testModel),
      expect(role('heading', { name: 'To Do' })).toExist(),
      expect(role('heading', { name: 'In Progress' })).toExist(),
      expect(role('heading', { name: 'Done' })).toExist(),
    )
  })

  test('columns show card counts from test data', () => {
    scene(
      { update, view },
      given(testModel),
      expect(toDoColumn).toContainText('2'),
      expect(inProgressColumn).toContainText('1'),
      expect(doneColumn).toContainText('0'),
    )
  })

  test('card titles are rendered within their columns', () => {
    scene(
      { update, view },
      given(testModel),
      expect(within(toDoColumn, text('Write tests'))).toExist(),
      expect(within(toDoColumn, text('Fix bug'))).toExist(),
      expect(within(inProgressColumn, text('Review PR'))).toExist(),
    )
  })

  test('clicking add card shows the form within the column', () => {
    scene(
      { update, view },
      given(testModel),
      inside(
        toDoColumn,
        click(role('button', { name: '+ Add card' })),
        acknowledgeFocusInput,
        expect(label('New card title')).toExist(),
      ),
    )
  })

  test('typing a card title updates the input', () => {
    scene(
      { update, view },
      given(testModel),
      click(within(toDoColumn, role('button', { name: '+ Add card' }))),
      acknowledgeFocusInput,
      type(label('New card title'), 'Buy groceries'),
      expect(label('New card title')).toHaveValue('Buy groceries'),
    )
  })

  test('submitting the form adds a card to the column', () => {
    scene(
      { update, view },
      given(testModel),
      inside(
        toDoColumn,
        click(role('button', { name: '+ Add card' })),
        acknowledgeFocusInput,
        type(label('New card title'), 'Buy groceries'),
        submit(role('form')),
        Command.expectExact(GenerateCardId),
        Command.resolve(
          GenerateCardId,
          Message.CompletedGenerateCardId({
            cardId: 'test-uuid',
            columnId: 'todo',
            title: 'Buy groceries',
          }),
        ),
        expect(text('Buy groceries')).toExist(),
      ),
    )
  })

  test('cancelling closes the form and restores the add card button', () => {
    scene(
      { update, view },
      given(testModel),
      click(within(toDoColumn, role('button', { name: '+ Add card' }))),
      acknowledgeFocusInput,
      expect(label('New card title')).toExist(),
      click(role('button', { name: 'Cancel' })),
      expect(label('New card title')).toBeAbsent(),
      expect(within(toDoColumn, role('button', { name: '+ Add card' }))).toExist(),
    )
  })
})
