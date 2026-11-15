/// <reference types="@vitest/browser-playwright" />
/**
 * The topics form in a real browser: Enter and the comma add a tag without
 * submitting the form, the arrow keys, Home, End, Backspace and Delete work
 * the chips, a draft left in the input is added on blur, and what the form
 * submits (read from `FormData`) is the chips and never the draft.
 */
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FORM, Model, NAME, RECEIPT, initial, update } from '../src/tags-input/app.js'
import { FieldStyle, FormStyle, SubmitStyle, TagsForm } from '../src/tags-input/view.js'
import { pageStylesheet } from '../src/style.js'

let dispose = () => {}
const realFrame = window.requestAnimationFrame
afterEach(() => {
  window.requestAnimationFrame = realFrame
  dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(FormStyle, FieldStyle, SubmitStyle)
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'tags-input'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: TagsForm,
    }),
  ).dispose
  await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
}

const input = () => {
  const field = document.getElementById('topics-input')
  if (!(field instanceof HTMLInputElement)) throw new Error('the topics input is not drawn')
  return field
}
const chips = () =>
  Array.from(document.querySelectorAll('li')).map(chip => chip.firstChild?.textContent)
const submit = () => {
  const button = document.querySelector('button[type="submit"]')
  if (!(button instanceof HTMLButtonElement)) throw new Error('the submit button is not drawn')
  return button
}
const receipt = () => document.getElementById(RECEIPT)?.textContent
const focused = () =>
  document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.id
const submitted = () => {
  const form = document.forms.namedItem(FORM)
  return form === null
    ? []
    : new FormData(form).getAll(NAME).flatMap(entry => (typeof entry === 'string' ? [entry] : []))
}

it('Enter and the comma add tags without submitting, and the form submits the chips, not the draft', async () => {
  await mount()
  expect(submitted()).toEqual(['foldkit', 'effect'])
  input().focus()
  await userEvent.keyboard('react{Enter}')
  await vi.waitFor(() => expect(chips()).toEqual(['foldkit', 'effect', 'react']))
  await userEvent.keyboard('vue,')
  await vi.waitFor(() => expect(chips()).toEqual(['foldkit', 'effect', 'react', 'vue']))
  expect(receipt()).toBe('')

  await userEvent.keyboard('half')
  await vi.waitFor(() => expect(input().value).toBe('half'))
  expect(submitted()).toEqual(chips())
  expect(submitted()).toEqual(['foldkit', 'effect', 'react', 'vue'])
})

it('the arrow keys, Home and End move among the chips and back to the input', async () => {
  await mount()
  input().focus()
  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(focused()).toBe('Remove effect'))
  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(focused()).toBe('Remove foldkit'))
  await userEvent.keyboard('{End}')
  await vi.waitFor(() => expect(focused()).toBe('Remove effect'))
  await userEvent.keyboard('{Home}')
  await vi.waitFor(() => expect(focused()).toBe('Remove foldkit'))
  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(focused()).toBe('Remove effect'))
  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(document.activeElement).toBe(input()))
})

it('Delete and Backspace on a chip remove it and keep focus in the field; the form follows', async () => {
  await mount()
  input().focus()
  await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
  await vi.waitFor(() => expect(focused()).toBe('Remove foldkit'))

  await userEvent.keyboard('{Delete}')
  await vi.waitFor(() => expect(chips()).toEqual(['effect']))
  await vi.waitFor(() => expect(focused()).toBe('Remove effect'))
  expect(submitted()).toEqual(['effect'])

  await userEvent.keyboard('{Backspace}')
  await vi.waitFor(() => expect(chips()).toEqual([]))
  await vi.waitFor(() => expect(document.activeElement).toBe(input()))
  expect(submitted()).toEqual([])
})

it('Backspace in the empty input removes the last chip', async () => {
  await mount()
  input().focus()
  await userEvent.keyboard('{Backspace}')
  await vi.waitFor(() => expect(chips()).toEqual(['foldkit']))
  expect(submitted()).toEqual(['foldkit'])
})

it('a draft left in the input becomes a tag when focus leaves it', async () => {
  await mount()
  input().focus()
  await userEvent.keyboard('solid')
  await vi.waitFor(() => expect(input().value).toBe('solid'))
  expect(chips()).toEqual(['foldkit', 'effect'])
  await userEvent.tab()
  await vi.waitFor(() => expect(chips()).toEqual(['foldkit', 'effect', 'solid']))
  expect(input().value).toBe('')
  expect(submitted()).toEqual(['foldkit', 'effect', 'solid'])
})

it('a submit in the frame after a blur added a tag still names that tag', async () => {
  await mount()
  input().focus()
  await userEvent.keyboard('beta')
  await vi.waitFor(() => expect(input().value).toBe('beta'))
  // Hold the frame the blur's commit is drawn in: the submit's read has to wait for it.
  const held: Array<FrameRequestCallback> = []
  window.requestAnimationFrame = callback => held.push(callback)
  input().blur()
  submit().click()
  // The submit's Command runs in a task after the click, while the frame is still held.
  await new Promise(resolve => setTimeout(resolve, 100))
  window.requestAnimationFrame = realFrame
  for (const callback of held.splice(0)) callback(performance.now())
  await vi.waitFor(() => expect(receipt()).toBe('Submitted foldkit, effect, beta'))
})
