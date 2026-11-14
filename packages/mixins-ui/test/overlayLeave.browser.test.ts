/**
 * The shipped overlays while they leave: a Dialog stays drawn for its exit
 * and holds the page until it is done, a Menu hands focus back at once, and a
 * close met by an open mid-exit settles on one open Dialog.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
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

// Long enough to act on the exit, short enough to wait it out.
const LEAVE_MS = 1500

const openOuter = async () => {
  const trigger = await present(ids.openOuter)
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await present(ids.outerPanel)
  await vi.waitFor(() => expect(isOpen(ids.outerDialog)).toBe(true))
  // Entered: no state left on the panel.
  await vi.waitFor(() => expect(byId(ids.outerPanel)?.hasAttribute('data-enter')).toBe(false), {
    timeout: 5000,
  })
}

/** Escape, then until the panel is marked as leaving. */
const startLeaving = async () => {
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(byId(ids.outerPanel)?.hasAttribute('data-leave')).toBe(true))
}

test('a leaving Dialog still holds the page, and gives focus to its trigger when it is gone', async () => {
  const handle = mount({ animated: true, leaveMs: LEAVE_MS })
  try {
    await openOuter()
    await startLeaving()
    const panel = byId(ids.outerPanel)
    // The panel is inert, so the control that held focus gives it up: it rests
    // on the body until the close hands it to the trigger.
    expect(panel?.contains(document.activeElement)).toBe(false)
    expect(active()).toBe('BODY')
    expect(isInert(ids.outsideButton)).toBe(true)
    expect(scrollLocked()).toBe(true)
    await gone(ids.outerPanel)
    await vi.waitFor(() => expect(active()).toBe(ids.openOuter))
    expect(isInert(ids.openOuter)).toBe(false)
    expect(scrollLocked()).toBe(false)
  } finally {
    handle.dispose()
  }
})

/** A real press at the middle of an element, as a pointer would send it. */
const pressAt = async (element: HTMLElement) => {
  const box = element.getBoundingClientRect()
  const point = {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    button: 'left' as const,
  }
  await cdp().send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
  await cdp().send('Input.dispatchMouseEvent', { type: 'mousePressed', clickCount: 1, ...point })
  await cdp().send('Input.dispatchMouseEvent', { type: 'mouseReleased', clickCount: 1, ...point })
}

test('a control in a leaving Dialog takes neither a press nor a key', async () => {
  const handle = mount({ animated: true, leaveMs: LEAVE_MS })
  try {
    await openOuter()
    const inner = byId(ids.openInner)!
    inner.focus()
    expect(active()).toBe(ids.openInner)
    await startLeaving()
    expect(byId(ids.outerPanel)?.hasAttribute('inert')).toBe(true)
    await pressAt(inner)
    inner.click()
    inner.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    await gone(ids.outerPanel)
    await vi.waitFor(() => expect(active()).toBe(ids.openOuter))
    expect(isOpen(ids.innerDialog)).toBe(false)
  } finally {
    handle.dispose()
  }
})

// The Sheet draws the Dialog's bundles, so its exit holds still the same way.
test('a control in a leaving Sheet takes neither a press nor a key', async () => {
  let acted = 0
  const { panel, dispose } = await openSheet(
    { side: 'bottom' },
    {},
    {
      content: h => [h.button([h.Id('sheet-control')], ['Apply'])],
    },
  )
  try {
    // A slow exit, so there is time to act on it.
    const slow = document.createElement('style')
    slow.dataset['test'] = ''
    slow.textContent = `#edge-panel { transition-duration: ${LEAVE_MS}ms !important; }`
    document.head.append(slow)
    const control = byId('sheet-control')!
    control.addEventListener('click', () => acted++)
    control.focus()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel.hasAttribute('data-leave')).toBe(true))
    expect(panel.hasAttribute('inert')).toBe(true)
    await pressAt(control)
    control.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(acted).toBe(0)
  } finally {
    dispose()
  }
})

test('an open sent mid-exit leaves one open Dialog, holding the page, that closes cleanly', async () => {
  const handle = mount({ animated: true, leaveMs: LEAVE_MS })
  try {
    await openOuter()
    await startLeaving()
    byId(ids.openOuter)?.click()
    await vi.waitFor(() => expect(byId(ids.outerPanel)?.hasAttribute('data-leave')).toBe(false))
    await vi.waitFor(
      () => expect(byId(ids.outerPanel)?.hasAttribute('data-transition')).toBe(false),
      {
        timeout: 5000,
      },
    )
    expect(isOpen(ids.outerDialog)).toBe(true)
    expect(byId(ids.outerPanel)?.hasAttribute('data-closed')).toBe(false)
    expect(byId(ids.outerPanel)?.hasAttribute('inert')).toBe(false)
    expect(isInert(ids.outsideButton)).toBe(true)
    expect(scrollLocked()).toBe(true)

    await userEvent.keyboard('{Escape}')
    await gone(ids.outerPanel)
    await vi.waitFor(() => expect(active()).toBe(ids.openOuter))
    expect(isInert(ids.outsideButton)).toBe(false)
    expect(scrollLocked()).toBe(false)
  } finally {
    handle.dispose()
  }
})

test('a leaving Menu has already given focus to its trigger and takes no row press', async () => {
  const handle = mount({ animated: true, leaveMs: LEAVE_MS })
  try {
    await openOuter()
    await userEvent.click(await present(ids.menuButton))
    const panel = await present(ids.menuPanel)
    await vi.waitFor(() => expect(panel.hasAttribute('data-enter')).toBe(false), { timeout: 5000 })
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel.hasAttribute('data-leave')).toBe(true))
    expect(active()).toBe(ids.menuButton)
    byId('menu-item-1')?.click()
    await gone(ids.menuPanel)
    expect(isOpen(ids.innerDialog)).toBe(false)
    expect(isOpen(ids.outerDialog)).toBe(true)
  } finally {
    handle.dispose()
  }
})
