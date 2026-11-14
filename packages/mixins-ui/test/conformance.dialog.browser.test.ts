/**
 * The APG modal dialog, run over `Dialog` in a real browser on the overlay
 * fixture: named by its title, modal, Tab kept inside, Escape and the close
 * button, and focus on open and back on the opener at close.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { axOf, press, referenced, settle } from './conformance.js'
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
} from './overlayFixture.js'

afterEach(cleanup)

const dialog = () => byId(ids.outerDialog) as HTMLDialogElement
const panel = () => byId(ids.outerPanel)!

/** Opened as a keyboard user opens it, from its opener. */
const open = async (how: 'Enter' | 'click' = 'Enter') => {
  const opener = await present(ids.openOuter)
  if (how === 'Enter') {
    opener.focus()
    await userEvent.keyboard('{Enter}')
  } else {
    await userEvent.click(opener)
  }
  await present(ids.outerPanel)
  await vi.waitFor(() => expect(isOpen(ids.outerDialog)).toBe(true))
}

const insideDialog = () => dialog().contains(document.activeElement)

test('Dialog: the dialog is named by its title, in Chrome', async () => {
  const handle = mount()
  try {
    await open()
    const [ax] = await axOf([dialog()])
    expect(ax).toMatchObject({ role: 'dialog', name: 'Outer', ignored: false })
    const [title] = referenced(dialog(), 'aria-labelledby')
    expect(title!.textContent).toBe('Outer')
    const [heading] = await axOf([title!])
    expect(heading).toMatchObject({ role: 'heading', name: 'Outer' })
  } finally {
    handle.dispose()
  }
})

test('Dialog: it is modal: the page behind it is out of reach', async () => {
  const handle = mount()
  try {
    await open()
    // Upstream opens with `show()` and holds the page out itself (inert, a focus trap), so the browser's `:modal` is not the claim.
    expect(dialog().open).toBe(true)
    expect(dialog().getAttribute('aria-modal')).toBe('true')
    expect(isInert(ids.outsideButton)).toBe(true)
    expect(isInert(ids.openOuter)).toBe(true)
  } finally {
    handle.dispose()
  }
})

test('Dialog: focus moves inside when it opens', async () => {
  const handle = mount()
  try {
    await open()
    await vi.waitFor(() => expect(insideDialog()).toBe(true))
  } finally {
    handle.dispose()
  }
})

/** The elements Tab visits, in order, until it comes round to where it began. */
const cycle = async (key: 'Tab' | 'Shift+Tab', limit: number) => {
  const seen: Array<Element> = []
  for (let count = 0; count < limit; count++) {
    await press(key)
    await settle(1)
    const at = document.activeElement
    if (at === null) throw new Error('focus fell to nothing')
    if (seen.includes(at)) return { seen, closed: true }
    seen.push(at)
  }
  return { seen, closed: false }
}

test.each(['Tab', 'Shift+Tab'] as const)('Dialog: %s stays inside and goes round', async key => {
  const handle = mount()
  try {
    await open()
    await vi.waitFor(() => expect(insideDialog()).toBe(true))
    const { seen, closed } = await cycle(key, 20)
    // It goes round: focus returns to an element it has been to, and never leaves.
    expect(closed).toBe(true)
    expect(seen.length).toBeGreaterThan(2)
    for (const element of seen) expect(dialog().contains(element)).toBe(true)
    expect(seen).not.toContain(byId(ids.outsideButton))
    expect(seen).not.toContain(byId(ids.openOuter))
  } finally {
    handle.dispose()
  }
})

test.each(['Enter', 'click'] as const)(
  'Dialog: Escape closes it and focus returns to the opener (opened by %s)',
  async how => {
    const handle = mount()
    try {
      await open(how)
      await press('Escape')
      await gone(ids.outerPanel)
      await vi.waitFor(() => expect(isOpen(ids.outerDialog)).toBe(false))
      await vi.waitFor(() => expect(active()).toBe(ids.openOuter))
      expect(isInert(ids.outsideButton)).toBe(false)
    } finally {
      handle.dispose()
    }
  },
)

test('Dialog: its close button closes it and focus returns to the opener', async () => {
  const handle = mount()
  try {
    await open()
    await userEvent.click(await present(ids.closeOuter))
    await gone(ids.outerPanel)
    await vi.waitFor(() => expect(active()).toBe(ids.openOuter))
  } finally {
    handle.dispose()
  }
})

test('Dialog: a press on the backdrop closes it', async () => {
  const handle = mount()
  try {
    await open()
    const box = panel().getBoundingClientRect()
    // Outside the panel, in the dialog element that covers the page.
    await userEvent.click(dialog(), { position: { x: 4, y: box.bottom + 20 } })
    await gone(ids.outerPanel)
    await vi.waitFor(() => expect(active()).toBe(ids.openOuter))
  } finally {
    handle.dispose()
  }
})
