import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Model, initial, update } from '../src/choices/app.js'
import { Choices, choicesStyles } from '../src/choices/view.js'
import { pageStylesheet } from '../src/style.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(...choicesStyles)
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'choices'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: Choices,
    }),
  ).dispose
  await vi.waitFor(() => expect(radio('m')).not.toBeNull())
}

const radio = (value: string) => document.getElementById(`size-${value}`)!
const styleButtons = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[role="group"][aria-label="Text style"] button'),
  )
const thumb = () => document.getElementById('volume-value') as HTMLInputElement
const lines = () =>
  Array.from(document.querySelectorAll('[aria-label="Choices"] p'), line => line.textContent ?? '')
const line = (name: string) => lines().find(text => text.startsWith(`${name}:`))
const counts = (name: string) => {
  const [, value = '', count = ''] = /: (\d+) \(\w+ (\d+)\)/.exec(line(name) ?? '') ?? []
  return { value: Number(value), count: Number(count) }
}

it('arrows on the radio group move the choice and focus together, wrapping, and Home goes to the first', async () => {
  await mount()
  expect(['s', 'm', 'l'].map(value => radio(value).tabIndex)).toEqual([-1, 0, -1])
  radio('m').focus()

  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(line('Size')).toBe('Size: l'))
  expect(document.activeElement).toBe(radio('l'))
  expect(['s', 'm', 'l'].map(value => radio(value).tabIndex)).toEqual([-1, -1, 0])
  expect(radio('l').getAttribute('aria-checked')).toBe('true')

  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(line('Size')).toBe('Size: s'))
  expect(document.activeElement).toBe(radio('s'))

  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(line('Size')).toBe('Size: l'))
  await userEvent.keyboard('{Home}')
  await vi.waitFor(() => expect(line('Size')).toBe('Size: s'))
  expect(document.activeElement).toBe(radio('s'))
})

it('the multiple group presses any number of buttons, each a tab stop', async () => {
  await mount()
  const [bold, italic, underline] = styleButtons()
  expect(styleButtons().map(button => button.tabIndex)).toEqual([0, 0, 0])
  expect(document.querySelector('[aria-label="Text style"]')?.getAttribute('role')).toBe('group')

  bold!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(line('Styles')).toBe('Styles: bold'))
  await userEvent.tab()
  expect(document.activeElement).toBe(italic)
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(line('Styles')).toBe('Styles: bold, italic'))
  expect(styleButtons().map(button => button.getAttribute('aria-pressed'))).toEqual([
    'true',
    'true',
    'false',
  ])
  await userEvent.tab()
  expect(document.activeElement).toBe(underline)

  bold!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(line('Styles')).toBe('Styles: italic'))
})

it('each arrow key on the slider moves the live value and commits it', async () => {
  await mount()
  thumb().focus()
  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(counts('Committed')).toEqual({ value: 51, count: 1 }))
  expect(counts('Live')).toEqual({ value: 51, count: 1 })
  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(counts('Committed')).toEqual({ value: 52, count: 2 }))
  expect(counts('Live')).toEqual({ value: 52, count: 2 })
})

it('steps of a drag move the live value alone; the release commits once, with the last value', async () => {
  await mount()
  const input = thumb()
  // Native input events without the `change` a release sends: the live value moves, the committed one stays.
  for (const value of ['60', '70']) {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  await vi.waitFor(() => expect(counts('Live')).toEqual({ value: 70, count: 2 }))
  expect(counts('Committed')).toEqual({ value: 50, count: 0 })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await vi.waitFor(() => expect(counts('Committed')).toEqual({ value: 70, count: 1 }))
})

it('a pointer drag commits once, at the release, to the value the thumb ends on', async () => {
  await mount()
  const input = thumb()
  const box = input.getBoundingClientRect()
  await userEvent.dragAndDrop(input, input, {
    sourcePosition: { x: box.width * 0.5, y: box.height / 2 },
    targetPosition: { x: box.width * 0.9, y: box.height / 2 },
  })
  await vi.waitFor(() => expect(counts('Committed').count).toBe(1))
  const ended = Number(thumb().value)
  expect(ended).toBeGreaterThan(70)
  expect(counts('Committed').value).toBe(ended)
  expect(counts('Live').value).toBe(ended)
})
