/**
 * The shipped overlays stacked on a real page: a Dialog opened from a Dialog,
 * a Menu and a Popover inside a Dialog, a trigger removed while its Dialog is
 * open, and where focus lands on each way out.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  active,
  byId,
  cleanup,
  gone,
  ids,
  isInert,
  isOpen,
  mount,
  present,
  scrollLocked,
} from './overlayFixture.js'
import { open as openSheet } from './sheetFixture.js'

afterEach(cleanup)

const openOuter = async () => {
  const trigger = await present(ids.openOuter)
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await present(ids.outerPanel)
  await vi.waitFor(() => expect(isOpen(ids.outerDialog)).toBe(true))
}

const openInnerFromOuter = async () => {
  const trigger = await present(ids.openInner)
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await present(ids.innerPanel)
  await vi.waitFor(() => expect(isOpen(ids.innerDialog)).toBe(true))
}

test('a Dialog opened from a Dialog: Escape closes the top one, focus and the page unwind in order', async () => {
  const handle = mount()
  try {
    await openOuter()
    await vi.waitFor(() =>
      expect(byId(ids.outerDialog)?.contains(document.activeElement)).toBe(true),
    )
    expect(scrollLocked()).toBe(true)
    expect(isInert(ids.openOuter)).toBe(true)

    await openInnerFromOuter()
    // The inner takes focus; the outer is inert behind it, the page too.
    await vi.waitFor(() =>
      expect(byId(ids.innerDialog)?.contains(document.activeElement)).toBe(true),
    )
    expect(isInert(ids.openInner)).toBe(true)
    expect(isInert(ids.outsideButton)).toBe(true)

    await userEvent.keyboard('{Escape}')
    await gone(ids.innerPanel)
    // Back on the control that opened it; the outer is still open and live.
    await vi.waitFor(() => expect(active()).toBe(ids.openInner))
    expect(isOpen(ids.outerDialog)).toBe(true)
    expect(isInert(ids.openInner)).toBe(false)
    expect(isInert(ids.outsideButton)).toBe(true)
    expect(scrollLocked()).toBe(true)

    await userEvent.keyboard('{Escape}')
    await gone(ids.outerPanel)
    await vi.waitFor(() => expect(active()).toBe(ids.openOuter))
    expect(isInert(ids.openOuter)).toBe(false)
    expect(isInert(ids.outsideButton)).toBe(false)
    expect(scrollLocked()).toBe(false)
  } finally {
    handle.dispose()
  }
})

test('a Dialog closed from its own button unwinds the stack the same way', async () => {
  const handle = mount()
  try {
    await openOuter()
    await openInnerFromOuter()
    await userEvent.click(await present(ids.closeInner))
    await gone(ids.innerPanel)
    await vi.waitFor(() => expect(active()).toBe(ids.openInner))
    expect(scrollLocked()).toBe(true)
    await userEvent.click(await present(ids.closeOuter))
    await gone(ids.outerPanel)
    await vi.waitFor(() => expect(active()).toBe(ids.openOuter))
    expect(scrollLocked()).toBe(false)
    expect(isInert(ids.outsideButton)).toBe(false)
  } finally {
    handle.dispose()
  }
})

test('the outer Dialog closing under the inner one leaves the inner holding the page', async () => {
  const handle = mount()
  try {
    await openOuter()
    await openInnerFromOuter()
    // An out-of-order close: the lower layer goes first.
    byId(ids.outerDialog)?.dispatchEvent(new CustomEvent('cancel', { cancelable: true }))
    await gone(ids.outerPanel)
    expect(isOpen(ids.innerDialog)).toBe(true)
    expect(isInert(ids.outsideButton)).toBe(true)
    expect(scrollLocked()).toBe(true)
    await userEvent.keyboard('{Escape}')
    await gone(ids.innerPanel)
    expect(scrollLocked()).toBe(false)
    expect(isInert(ids.outsideButton)).toBe(false)
  } finally {
    handle.dispose()
  }
})

const frames = async (count: number) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
}

/** A press on the page where `id` is drawn: whatever the open popup lays there takes it, as a user's would. */
const pressWhere = async (id: string) => {
  const box = (await present(id)).getBoundingClientRect()
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  if (!(hit instanceof HTMLElement)) throw new Error('nothing is drawn there')
  await userEvent.click(hit, {
    position: {
      x: box.left + box.width / 2 - hit.getBoundingClientRect().left,
      y: box.top + box.height / 2 - hit.getBoundingClientRect().top,
    },
  })
}

/** Every element focus landed on from now on, by id or tag. */
const watchFocus = () => {
  const seen: Array<string> = []
  const listener = (event: FocusEvent) => {
    const target = event.target
    seen.push(target instanceof Element ? target.id || target.tagName : 'window')
  }
  document.addEventListener('focusin', listener)
  return { seen, stop: () => document.removeEventListener('focusin', listener) }
}

test('a Menu inside a Dialog: Escape closes the menu alone, and an outside press inside the dialog does too', async () => {
  const handle = mount()
  try {
    await openOuter()
    await userEvent.click(await present(ids.menuButton))
    await present(ids.menuPanel)
    await userEvent.keyboard('{Escape}')
    await gone(ids.menuPanel)
    expect(isOpen(ids.outerDialog)).toBe(true)
    expect(scrollLocked()).toBe(true)

    await userEvent.click(await present(ids.menuButton))
    await present(ids.menuPanel)
    await pressWhere(ids.dialogText)
    await gone(ids.menuPanel)
    expect(isOpen(ids.outerDialog)).toBe(true)
    expect(byId(ids.outerDialog)?.contains(document.activeElement)).toBe(true)
  } finally {
    handle.dispose()
  }
})

test('a Popover inside a Dialog: Escape closes the popover alone, and an outside press inside the dialog does too', async () => {
  const handle = mount()
  try {
    await openOuter()
    await userEvent.click(await present(ids.popoverButton))
    await present(ids.popoverPanel)
    await userEvent.keyboard('{Escape}')
    await gone(ids.popoverPanel)
    expect(isOpen(ids.outerDialog)).toBe(true)

    await userEvent.click(await present(ids.popoverButton))
    await present(ids.popoverPanel)
    await pressWhere(ids.dialogText)
    await gone(ids.popoverPanel)
    expect(isOpen(ids.outerDialog)).toBe(true)
  } finally {
    handle.dispose()
  }
})

test('Tab stays inside a Dialog with a popup open in it', async () => {
  const handle = mount()
  try {
    await openOuter()
    await userEvent.click(await present(ids.popoverButton))
    await present(ids.popoverPanel)
    for (let press = 0; press < 12; press += 1) {
      await userEvent.keyboard('{Tab}')
      expect(byId(ids.outerDialog)?.contains(document.activeElement)).toBe(true)
    }
  } finally {
    handle.dispose()
  }
})

test('Tab from the last control of a Dialog wraps to its first, and Shift+Tab back', async () => {
  const handle = mount()
  try {
    await openOuter()
    const controls = Array.from(byId(ids.outerDialog)?.querySelectorAll('button') ?? []).filter(
      button => button.checkVisibility(),
    )
    const first = controls.at(0)
    const last = controls.at(-1)
    if (first === undefined || last === undefined) throw new Error('the Dialog drew no controls')
    last.focus()
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(first)
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(document.activeElement).toBe(last)
  } finally {
    handle.dispose()
  }
})

/** A Dialog opened from a trigger that the page then removes, closed by Escape. */
const closedWithoutItsTrigger = async () => {
  await openOuter()
  await userEvent.click(await present(ids.removeTrigger))
  await gone(ids.openOuter)
  await userEvent.keyboard('{Escape}')
  await gone(ids.outerPanel)
  await frames(5)
}

test('a Dialog closed after its trigger was removed throws nothing and releases the page', async () => {
  const errors: Array<string> = []
  const onError = (event: ErrorEvent) => errors.push(event.message)
  const onRejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason))
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  const handle = mount()
  try {
    await closedWithoutItsTrigger()
    expect(errors).toEqual([])
    expect(scrollLocked()).toBe(false)
    expect(isInert(ids.outsideButton)).toBe(false)
  } finally {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    handle.dispose()
  }
})

// `Dom.closeDialog` refocuses its recorded element only while that is still in
// the document, and guesses no other: with no fallback named, focus is on the body.
test('a Dialog closed after its trigger was removed leaves focus on the body when no fallback is named', async () => {
  const handle = mount()
  try {
    await closedWithoutItsTrigger()
    expect(active()).toBe('BODY')
  } finally {
    handle.dispose()
  }
})

test('a Dialog closed after its trigger was removed hands focus to the fallback it names', async () => {
  const handle = mount({ focusFallback: true })
  try {
    await closedWithoutItsTrigger()
    await vi.waitFor(() => expect(active()).toBe(ids.fallbackButton))
  } finally {
    handle.dispose()
  }
})

test('a Dialog with a fallback still returns focus to its trigger when the trigger is there', async () => {
  const handle = mount({ focusFallback: true })
  try {
    await openOuter()
    await userEvent.keyboard('{Escape}')
    await gone(ids.outerPanel)
    await frames(10)
    expect(active()).toBe(ids.openOuter)
  } finally {
    handle.dispose()
  }
})

test('a Dialog with a fallback leaves focus where an action moved it', async () => {
  const handle = mount({ focusFallback: true })
  try {
    await openOuter()
    await userEvent.click(await present(ids.removeTrigger))
    await gone(ids.openOuter)
    await userEvent.click(await present(ids.closeAndFocus))
    await gone(ids.outerPanel)
    await frames(10)
    expect(active()).toBe(ids.outsideButton)
  } finally {
    handle.dispose()
  }
})

type Opening = 'keyboard' | 'pointer'
type Closing = 'Escape' | 'a press on the backdrop' | 'a button inside'

const open = async (how: Opening) => {
  const trigger = await present(ids.openOuter)
  if (how === 'keyboard') {
    trigger.focus()
    await userEvent.keyboard('{Enter}')
  } else {
    await userEvent.click(trigger)
  }
  await present(ids.outerPanel)
  await vi.waitFor(() => expect(isOpen(ids.outerDialog)).toBe(true))
}

const close = async (how: Closing) => {
  if (how === 'Escape') {
    await userEvent.keyboard('{Escape}')
  } else if (how === 'a button inside') {
    await userEvent.click(await present(ids.closeOuter))
  } else {
    const backdrop = byId(ids.outerDialog)?.firstElementChild
    if (!(backdrop instanceof HTMLElement)) throw new Error('the Dialog drew no backdrop')
    await userEvent.click(backdrop, { position: { x: 4, y: 4 } })
  }
  await gone(ids.outerPanel)
}

test.each<[Opening, Closing]>([
  ['keyboard', 'Escape'],
  ['keyboard', 'a press on the backdrop'],
  ['keyboard', 'a button inside'],
  ['pointer', 'Escape'],
  ['pointer', 'a press on the backdrop'],
  ['pointer', 'a button inside'],
])('opened from the %s, closed by %s: focus returns to the trigger', async (opening, closing) => {
  const handle = mount()
  try {
    await open(opening)
    await close(closing)
    await vi.waitFor(() => expect(active()).toBe(ids.openOuter))
  } finally {
    handle.dispose()
  }
})

test('an action that closes the Dialog and focuses the page is not undone by the return focus', async () => {
  const handle = mount()
  try {
    await openOuter()
    await userEvent.click(await present(ids.closeAndFocus))
    await gone(ids.outerPanel)
    await frames(10)
    expect(active()).toBe(ids.outsideButton)
  } finally {
    handle.dispose()
  }
})

test('a Menu row that opens a Dialog leaves focus in that Dialog', async () => {
  const handle = mount()
  try {
    await openOuter()
    await userEvent.click(await present(ids.menuButton))
    await present(ids.menuPanel)
    const focus = watchFocus()
    await userEvent.click(await present('menu-item-1'))
    await present(ids.innerPanel)
    await vi.waitFor(() => expect(isOpen(ids.innerDialog)).toBe(true))
    await gone(ids.menuPanel)
    await frames(10)
    focus.stop()
    expect(byId(ids.innerDialog)?.contains(document.activeElement)).toBe(true)
    // Once the inner Dialog took it, focus never left it for the menu's trigger.
    expect(focus.seen.at(-1)).not.toBe(ids.menuButton)
    expect(isInert(ids.openInner)).toBe(true)
  } finally {
    handle.dispose()
  }
})

// A Sheet opened with no opener on the page has nothing to hand focus back to.
test.each([
  {
    title: 'names a fallback',
    config: { focusFallback: 'sheet-fallback' },
    landing: 'sheet-fallback',
  },
  { title: 'names none', config: {}, landing: 'BODY' },
])('a Sheet that $title leaves focus on $landing after it closes', async ({ config, landing }) => {
  const outside = document.createElement('button')
  outside.id = 'sheet-fallback'
  document.body.append(outside)
  const { dispose } = await openSheet({ side: 'bottom', isAnimated: false, ...config })
  try {
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(byId('edge-panel')).toBeNull())
    await vi.waitFor(() => expect(active()).toBe(landing))
  } finally {
    dispose()
  }
})
