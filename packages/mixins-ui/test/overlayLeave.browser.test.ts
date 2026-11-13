/**
 * The shipped overlays while they leave: a Dialog stays drawn for its exit
 * and holds the page until it is done, a Menu hands focus back at once, and a
 * close met by an open mid-exit settles on one open Dialog.
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
    expect(panel?.contains(document.activeElement)).toBe(true)
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

// `@foldkit/ui`'s Dialog takes the close button and backdrop out of a leaving
// panel but leaves the application's own content live, and its RenderInfo
// does not say the panel is leaving, so a view cannot gate its controls.
test.fails('a control pressed in a leaving Dialog does nothing', async () => {
  const handle = mount({ animated: true, leaveMs: LEAVE_MS })
  try {
    await openOuter()
    await startLeaving()
    byId(ids.openInner)?.click()
    await gone(ids.outerPanel)
    expect(isOpen(ids.innerDialog)).toBe(false)
  } finally {
    handle.dispose()
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
    expect(byId(ids.outerDialog)?.contains(document.activeElement)).toBe(true)
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
