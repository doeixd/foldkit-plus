import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Model, initial, update } from '../src/app-keys/app.js'
import { AppKeys, appKeysStyles } from '../src/app-keys/view.js'
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
  sheet.textContent = pageStylesheet + Style.stylesheet(...appKeysStyles)
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'app-keys'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: AppKeys,
    }),
  ).dispose
  await vi.waitFor(() => expect(field()).not.toBeNull())
}

const field = () => document.querySelector<HTMLInputElement>('[role="combobox"]')
const options = () =>
  Array.from(document.querySelectorAll('[role="option"]')).map(option => option.textContent)
const highlighted = () => field()?.getAttribute('aria-activedescendant')
const status = () => document.querySelector('[aria-label="Answers"]')?.textContent ?? ''
const triggers = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
const stopLabel = () => triggers().find(trigger => trigger.tabIndex === 0)?.textContent

it('the application’s End and Escape on the Command work beside its own arrows and Enter', async () => {
  await mount()
  field()!.focus()
  await userEvent.keyboard('file')
  await vi.waitFor(() => expect(options()).toEqual(['Open file', 'Save file']))
  expect(highlighted()).toBe('keys-command-open-file')

  await userEvent.keyboard('{End}')
  await vi.waitFor(() => expect(highlighted()).toBe('keys-command-save-file'))
  // The caret keys stay the field's; the application's End moved the highlight instead.
  expect(field()!.value).toBe('file')

  await userEvent.keyboard('{ArrowUp}')
  await vi.waitFor(() => expect(highlighted()).toBe('keys-command-open-file'))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(status()).toContain('Ran: open-file'))

  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(field()!.value).toBe(''))
  await vi.waitFor(() => expect(options()).toHaveLength(4))
})

it('the application’s PageDown on the bar moves the tab stop and focus, beside the bar’s arrows', async () => {
  await mount()
  expect(triggers().map(trigger => trigger.textContent)).toEqual(['File', 'Edit', 'View'])
  triggers()[0]!.focus()
  expect(stopLabel()).toBe('File')

  await userEvent.keyboard('{PageDown}')
  await vi.waitFor(() => expect(status()).toContain('Bar tab stop: View'))
  await vi.waitFor(() => expect(document.activeElement).toBe(triggers()[2]))
  expect(stopLabel()).toBe('View')

  await userEvent.keyboard('{ArrowLeft}')
  await vi.waitFor(() => expect(status()).toContain('Bar tab stop: Edit'))
  await vi.waitFor(() => expect(document.activeElement).toBe(triggers()[1]))
})

it('shows the refusal of a route on a key each widget answers', async () => {
  await mount()
  const refusals = Array.from(
    document.querySelectorAll('[aria-label="Refused routes"] li'),
    item => item.textContent ?? '',
  )
  expect(refusals).toHaveLength(2)
  expect(refusals[0]).toContain('mixins:key-conflict')
  expect(refusals[0]).toContain('"Next" and "Down again"')
  expect(refusals[1]).toContain('"Menubar Home" and "Home again"')
})
