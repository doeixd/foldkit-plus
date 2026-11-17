/** Go to row: which row a number means, what it refuses, and where the keyboard goes. */
import { expect, test } from 'vitest'
import { Message, init, update } from '../src/main.js'

const goTo = (text: string, count = 100) => {
  const typed = update(init(count).model, Message.TypedRow({ text }))
  return update(typed.model, Message.WentToRow())
}

test('a row number counts from one and puts the keyboard on that product', () => {
  const step = goTo('50')
  expect(step.model.notice).toBe('Went to row 50.')
  const focus = step.commands?.find(command => command.name === 'FocusRow')
  expect(focus?.args).toEqual({ row: 'p49' })
})

test.each([
  ['0', 'No row 0: rows run from 1 to 100.'],
  ['101', 'No row 101: rows run from 1 to 100.'],
  ['2.5', 'No row 2.5: rows run from 1 to 100.'],
  ['', 'No row typed: rows run from 1 to 100.'],
])('%j is no row: the page says so and moves nothing', (text, notice) => {
  const step = goTo(text)
  expect(step.model.notice).toBe(notice)
  expect(step.commands?.some(command => command.name === 'FocusRow') ?? false).toBe(false)
})

test('typing the same text again returns the Model it was given', () => {
  const typed = update(init(10).model, Message.TypedRow({ text: '7' })).model
  expect(update(typed, Message.TypedRow({ text: '7' })).model).toBe(typed)
})
