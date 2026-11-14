import { expect, test } from 'vitest'
import { Message, initial, update } from '../src/dismissible-list/app.js'

test('a row and a branch leave the list by their own ids', () => {
  const withoutDesign = update(initial, Message.Removed({ id: 'design' })).model
  expect(withoutDesign.tags.map(tag => tag.id)).toEqual(['release', 'backlog'])

  const withoutDraft = update(initial, Message.RemovedChild({ id: 'draft' })).model
  expect(withoutDraft.tags.map(tag => tag.children)).toEqual([
    [],
    initial.tags[1]!.children,
    initial.tags[2]!.children,
  ])

  expect(update(initial, Message.Typed({ value: 'de' })).model.filter).toBe('de')
  expect(update(initial, Message.Cleared()).model.tags).toEqual([])
})

test('a message that changes nothing returns the model it was given', () => {
  const empty = { ...initial, tags: [] }
  for (const message of [
    Message.Typed({ value: '' }),
    Message.Removed({ id: 'missing' }),
    Message.RemovedChild({ id: 'missing' }),
  ]) {
    expect(update(initial, message).model).toBe(initial)
  }
  expect(update(empty, Message.Cleared()).model).toBe(empty)
})
