/**
 * The focus-kept section in a real browser. Dismissing a row with the
 * keyboard hands its focus to the next row's dismiss button, the last row to
 * the previous one's, and the only row to the list's Add button, in the
 * alerts and the cards alike; the two lists recover apart, and a dismissal
 * made while focus is elsewhere takes none. A toast arriving or leaving moves
 * no focus, and dismissing the toast that holds it hands it to its neighbour.
 */
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { Toast } from 'foldkit-mixins-ui'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { TOAST_ID, initial, update, Model } from '../src/focus-kept/app.js'
import { island } from '../src/focus-kept/island.js'
import { ADD_ALERT_ID, ADD_CARD_ID, FocusKept, NOTIFY_ID } from '../src/focus-kept/view.js'
import { pageStylesheet } from '../src/style.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (toast: Toast.Model = initial.toast) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(island.style())
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'focus-kept'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { ...initial, toast } }),
      update,
      view: FocusKept,
    }),
  ).dispose
}

const dismiss = (title: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="Dismiss ${title}"]`)
const byId = (id: string) => document.getElementById(id)!
const focused = () => document.activeElement

/** Takes focus where a keyboard user would be, and presses Enter. */
const pressEnterOn = async (control: HTMLElement) => {
  control.focus()
  await userEvent.keyboard('{Enter}')
}

const LISTS = [
  {
    name: 'alerts',
    titles: ['Disk almost full', 'Backup finished', 'Update available'],
    add: ADD_ALERT_ID,
  },
  { name: 'cards', titles: ['Invoice 1042', 'Invoice 1043', 'Invoice 1044'], add: ADD_CARD_ID },
] as const

test.each(LISTS)(
  'dismissing from the keyboard in the $name hands focus to the next row, then the previous, then Add',
  async ({ titles: [first, second, third], add }) => {
    mount()
    await vi.waitFor(() => expect(dismiss(first)).not.toBeNull())

    await pressEnterOn(dismiss(first)!)
    await vi.waitFor(() => expect(dismiss(first)).toBeNull())
    expect(focused()).toBe(dismiss(second))

    // The last row has no next: the previous one takes it.
    await pressEnterOn(dismiss(third)!)
    await vi.waitFor(() => expect(dismiss(third)).toBeNull())
    expect(focused()).toBe(dismiss(second))

    // The only row left: no neighbour, so the list's Add button.
    await pressEnterOn(dismiss(second)!)
    await vi.waitFor(() => expect(dismiss(second)).toBeNull())
    expect(focused()).toBe(byId(add))
  },
)

test('a dismissal in the middle of a list goes to the row after it', async () => {
  mount()
  await vi.waitFor(() => expect(dismiss('Backup finished')).not.toBeNull())
  await pressEnterOn(dismiss('Backup finished')!)
  await vi.waitFor(() => expect(dismiss('Backup finished')).toBeNull())
  expect(focused()).toBe(dismiss('Update available'))
})

test('the two lists recover apart: each falls back to its own Add button', async () => {
  mount()
  await vi.waitFor(() => expect(dismiss('Invoice 1042')).not.toBeNull())
  for (const title of ['Invoice 1042', 'Invoice 1043', 'Invoice 1044']) {
    await pressEnterOn(dismiss(title)!)
    await vi.waitFor(() => expect(dismiss(title)).toBeNull())
  }
  expect(focused()).toBe(byId(ADD_CARD_ID))
  // The alerts were not touched, and still recover among themselves.
  expect(dismiss('Disk almost full')).not.toBeNull()
  await pressEnterOn(dismiss('Disk almost full')!)
  await vi.waitFor(() => expect(dismiss('Disk almost full')).toBeNull())
  expect(focused()).toBe(dismiss('Backup finished'))
})

test('a row dismissed while focus is elsewhere takes none', async () => {
  mount()
  await vi.waitFor(() => expect(dismiss('Invoice 1042')).not.toBeNull())
  dismiss('Invoice 1042')!.focus()
  // `click()` presses without moving focus, as a script or an assistive tool does.
  dismiss('Update available')!.click()
  await vi.waitFor(() => expect(dismiss('Update available')).toBeNull())
  expect(focused()).toBe(dismiss('Invoice 1042'))
})

test('Add keeps focus where it was pressed, and the row it makes can be dismissed like the others', async () => {
  mount()
  await vi.waitFor(() => expect(byId(ADD_CARD_ID)).not.toBeNull())
  await pressEnterOn(byId(ADD_CARD_ID))
  await vi.waitFor(() => expect(dismiss('Invoice 1045')).not.toBeNull())
  expect(focused()).toBe(byId(ADD_CARD_ID))
  await pressEnterOn(dismiss('Invoice 1044')!)
  await vi.waitFor(() => expect(dismiss('Invoice 1044')).toBeNull())
  expect(focused()).toBe(dismiss('Invoice 1045'))
})

const toasts = () => Array.from(document.querySelectorAll<HTMLElement>(`li[id^="${TOAST_ID}-"]`))
const toastNamed = (title: string) => toasts().find(toast => toast.textContent?.includes(title))
const closeOf = (title: string) =>
  toastNamed(title)?.querySelector<HTMLElement>('button[aria-label="Dismiss"]')

/** Every toast drawn is where it is going: no enter or exit still moving. */
const settled = () =>
  vi.waitFor(
    () => {
      for (const toast of toasts()) expect(toast.getAnimations()).toEqual([])
    },
    { timeout: 5000 },
  )

/** The pointer somewhere that holds no toast and no control: a held stack does not count down. */
const parkPointer = () => userEvent.hover(document.body, { position: { x: 2, y: 2 } })

test('a toast that arrives and leaves moves no focus', async () => {
  mount(Toast.init(TOAST_ID, { duration: 500 }))
  await vi.waitFor(() => expect(byId(NOTIFY_ID)).not.toBeNull())
  await parkPointer()
  await pressEnterOn(byId(NOTIFY_ID))
  await vi.waitFor(() => expect(toastNamed('Saved draft 1')).not.toBeUndefined())
  expect(focused()).toBe(byId(NOTIFY_ID))
  await vi.waitFor(() => expect(toasts()).toHaveLength(0), { timeout: 8000 })
  expect(focused()).toBe(byId(NOTIFY_ID))
})

test('dismissing the toast that holds focus hands it to the toast behind, and none is guessed at the end', async () => {
  mount(Toast.init(TOAST_ID, { duration: 60_000 }))
  await vi.waitFor(() => expect(byId(NOTIFY_ID)).not.toBeNull())
  for (const title of ['Saved draft 1', 'Saved draft 2', 'Saved draft 3']) {
    await pressEnterOn(byId(NOTIFY_ID))
    await vi.waitFor(() => expect(toastNamed(title)).not.toBeUndefined())
  }
  await settled()
  // Newest in front: the order is 3, 2, 1.
  await pressEnterOn(closeOf('Saved draft 2')!)
  await vi.waitFor(() => expect(toastNamed('Saved draft 2')).toBeUndefined())
  expect(focused()).toBe(closeOf('Saved draft 1'))
  // The last in the order has none behind it: the one in front of it.
  await pressEnterOn(closeOf('Saved draft 1')!)
  await vi.waitFor(() => expect(toastNamed('Saved draft 1')).toBeUndefined())
  expect(focused()).toBe(closeOf('Saved draft 3'))
  // Nothing left in the stack: focus is not sent outside it.
  await pressEnterOn(closeOf('Saved draft 3')!)
  await vi.waitFor(() => expect(toasts()).toHaveLength(0))
  await new Promise(requestAnimationFrame)
  expect(focused()).toBe(document.body)
})
