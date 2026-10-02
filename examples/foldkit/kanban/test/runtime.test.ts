// @vitest-environment jsdom
/**
 * The board on the real runtime, with its columns kept in a store the way
 * `entry.ts` keeps them in localStorage: a reload is a second runtime reading
 * the same store. A keyboard drag runs here because `@foldkit/ui`'s
 * DragAndDrop finds the next place by querying the drawn page.
 */
import { KeyValueStore } from 'effect/persistence'
import * as Runtime from 'foldkit/runtime'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Flags, Model, flags, init, subscriptions, update } from '../src/main.js'
import { Board } from '../src/view/index.js'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})

const running: Array<() => void> = []

const unmount = (): void => {
  for (const dispose of running.splice(0)) dispose()
  document.body.replaceChildren()
}

afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const mount = (storage: Storage = window.localStorage): void => {
  const container = document.createElement('div')
  container.id = 'kanban-runtime'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      Flags,
      flags,
      init,
      update,
      view: Board,
      subscriptions,
      container,
      resources: KeyValueStore.layerStorage(() => storage),
    }),
  )
  running.push(() => handle.dispose())
}

/** A drag's keys go to the document once it starts; this lets its listener attach. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20))

const announcement = (): string =>
  document.querySelector('[aria-live="assertive"]')?.textContent ?? ''

const cardIdsIn = (column: string): ReadonlyArray<string | undefined> =>
  Array.from(
    document.querySelectorAll<HTMLElement>(`[aria-label="${column}"] [data-draggable-id]`),
    card => card.dataset['draggableId'],
  )

const focusedCardId = (): string | undefined =>
  document.activeElement instanceof HTMLElement
    ? document.activeElement.dataset['draggableId']
    : undefined

const press = (target: Element, key: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

/** Focuses card-1 and presses Space on it, as a keyboard user picks it up. */
const pickUpFirstCard = async (): Promise<void> => {
  await vi.waitFor(() => expect(cardIdsIn('To Do')[0]).toBe('card-1'))
  const card = document.querySelector<HTMLElement>('[data-draggable-id="card-1"]')
  if (card === null) throw new Error('no card-1')
  card.focus()
  press(card, ' ')
  await vi.waitFor(() => expect(announcement()).toMatch(/^Picked up Research drag-and-drop/))
  await settle()
}

/** Tab, ArrowDown, Space: card-1 to the second place of In Progress. */
const moveFirstCardToInProgress = async (): Promise<void> => {
  await pickUpFirstCard()
  press(document.activeElement ?? document.body, 'Tab')
  await vi.waitFor(() => expect(announcement()).toBe('Moved to In Progress, position 1.'))
  // The card is drawn anew in its preview place; the drag keeps focus on it.
  await vi.waitFor(() => expect(focusedCardId()).toBe('card-1'))
  press(document.activeElement ?? document.body, 'ArrowDown')
  await vi.waitFor(() => expect(announcement()).toBe('Position 2 in In Progress.'))
  press(document.activeElement ?? document.body, ' ')
  await vi.waitFor(() =>
    expect(announcement()).toBe(
      'Dropped Research drag-and-drop patterns in position 2 of In Progress.',
    ),
  )
}

test('a card moved to another column with the keyboard stays there after a reload', async () => {
  mount()
  await moveFirstCardToInProgress()
  expect(cardIdsIn('To Do')).not.toContain('card-1')
  expect(cardIdsIn('In Progress').slice(0, 2)).toEqual(['card-7', 'card-1'])
  expect(focusedCardId()).toBe('card-1')
  // Written at once, as upstream's SaveBoard wrote it, not after the mirror's default 250 ms.
  await vi.waitFor(() => expect(window.localStorage.getItem('kanban-board')).toContain('card-1'), {
    timeout: 100,
  })

  unmount()
  mount()
  await vi.waitFor(() => expect(cardIdsIn('In Progress').slice(0, 2)).toEqual(['card-7', 'card-1']))
  expect(cardIdsIn('To Do')).not.toContain('card-1')
})

test('Escape puts a picked-up card back', async () => {
  mount()
  await pickUpFirstCard()
  press(document.activeElement ?? document.body, 'ArrowDown')
  await vi.waitFor(() => expect(announcement()).toBe('Position 2 in To Do.'))
  press(document.activeElement ?? document.body, 'Escape')
  await vi.waitFor(() =>
    expect(announcement()).toBe(
      'Drag cancelled, Research drag-and-drop patterns returned to original position.',
    ),
  )
  expect(cardIdsIn('To Do')[0]).toBe('card-1')
})

test('keeps a move when the store refuses to save it', async () => {
  const failing: Storage = {
    length: 0,
    key: () => null,
    clear: () => {},
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
  mount(failing)
  await moveFirstCardToInProgress()
  expect(cardIdsIn('In Progress').slice(0, 2)).toEqual(['card-7', 'card-1'])
  // The page still answers after the failed write.
  await settle()
  press(document.activeElement ?? document.body, ' ')
  await vi.waitFor(() => expect(announcement()).toMatch(/^Picked up Research drag-and-drop/))
})
