/// <reference types="@vitest/browser-playwright" />
/**
 * The hotkeys section on a real page: the chord a button advertises is the one
 * that runs it, undo and redo read as the step they move over, and typing is one
 * step until a pause, which a clock the test owns makes (no sleeps).
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { Frames } from 'foldkit-mixins/testing'
import { platformFromUA, type Platform } from 'foldkit-primitives/media'
import { WITHIN_MS } from '../src/hotkeys/app.js'
import { mountHotkeys } from '../src/hotkeys/mount.js'
import { pageStylesheet } from '../src/style.js'

let handle: { readonly dispose: () => void } | undefined
let frames: ReturnType<typeof Frames.track> | undefined
let time = 0

beforeEach(() => {
  Style.install(pageStylesheet)
  frames = Frames.track()
  time = 0
})

afterEach(() => {
  handle?.dispose()
  handle = undefined
  frames?.dispose()
  frames = undefined
  document.body.replaceChildren()
})

const mount = async (platform?: Platform) => {
  const container = document.createElement('div')
  container.id = 'hotkeys-host'
  document.body.appendChild(container)
  handle = mountHotkeys(container, {
    ...(platform === undefined ? {} : { platform }),
    now: () => time,
  })
  await vi.waitFor(() => expect(field()).not.toBeNull())
}

const field = () => document.querySelector<HTMLInputElement>('input')!
const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
const named = (start: string) => buttons().find(button => button.textContent.startsWith(start))!
const settle = () => frames?.settle()

// The modifier `mod` is on the platform this browser runs on.
const modifier = () => (platformFromUA(navigator.userAgent) === 'mac' ? 'Meta' : 'Control')

/** The keys an `aria-keyshortcuts` value names, pressed: `Control+Shift+Z` is Control, Shift, z. */
const pressed = (aria: string) => {
  const parts = aria.split('+')
  const key = parts.pop()!.toLowerCase()
  return `${parts.map(part => `{${part}>}`).join('')}${key}${parts
    .reverse()
    .map(part => `{/${part}}`)
    .join('')}`
}

const typeInField = async (text: string) => {
  field().focus()
  await userEvent.keyboard(text)
  await settle()
}

test('the chord runs its action, from the page and with focus in the field', async () => {
  await mount()
  await userEvent.keyboard(pressed(`${modifier()}+E`))
  await vi.waitFor(() => expect(field().value).toBe('Title 1'))
  field().focus()
  await userEvent.keyboard(pressed(`${modifier()}+E`))
  await vi.waitFor(() => expect(field().value).toBe('Title 2'))
})

test.each([
  ['windows', ['Control+E', 'Control+Z', 'Control+Shift+Z'], ['Ctrl+E', 'Ctrl+Z', 'Ctrl+Shift+Z']],
  ['mac', ['Meta+E', 'Meta+Z', 'Meta+Shift+Z'], ['⌘E', '⌘Z', '⌘⇧Z']],
] as const)(
  'on %s each button advertises the chord that runs it, and shows it',
  async (platform, aria, labels) => {
    await mount(platform)
    const [rename, undo, redo] = buttons()
    for (const [button, keys, label] of [
      [rename, aria[0], labels[0]],
      [undo, aria[1], labels[1]],
      [redo, aria[2], labels[2]],
    ] as const) {
      expect(button!.getAttribute('aria-keyshortcuts')).toBe(keys)
      expect(button!.querySelector('span')!.textContent.replace(/[\u2066\u2069]/g, '')).toBe(label)
    }
    // Pressing what each attribute says, read back from the page, does what the button does.
    const advertised = (name: string) => named(name).getAttribute('aria-keyshortcuts')!
    await userEvent.keyboard(pressed(advertised('Rename')))
    await vi.waitFor(() => expect(field().value).toBe('Title 1'))
    await userEvent.keyboard(pressed(advertised('Undo')))
    await vi.waitFor(() => expect(field().value).toBe('Untitled'))
    await userEvent.keyboard(pressed(advertised('Redo')))
    await vi.waitFor(() => expect(field().value).toBe('Title 1'))
  },
)

test('undo and redo name the step they move over, and restore its title', async () => {
  await mount()
  expect(named('Undo').textContent).toMatch(/^Undo/)
  expect(named('Undo').getAttribute('aria-disabled')).toBe('true')
  named('Rename').click()
  await vi.waitFor(() => expect(field().value).toBe('Title 1'))
  expect(named('Undo rename')).toBeDefined()
  named('Undo rename').click()
  await vi.waitFor(() => expect(field().value).toBe('Untitled'))
  expect(named('Redo rename')).toBeDefined()
  named('Redo rename').click()
  await vi.waitFor(() => expect(field().value).toBe('Title 1'))
})

test('typing is one undo step until a pause, which the clock the test owns ends', async () => {
  await mount()
  await typeInField('ab')
  await vi.waitFor(() => expect(field().value).toBe('Untitledab'))
  time += WITHIN_MS + 1
  await typeInField('c')
  await vi.waitFor(() => expect(field().value).toBe('Untitledabc'))
  expect(named('Undo').textContent).toMatch(/^Undo typing/)
  await userEvent.keyboard(pressed(`${modifier()}+Z`))
  // The pause made `c` a step of its own: undo takes back only it.
  await vi.waitFor(() => expect(field().value).toBe('Untitledab'))
  await userEvent.keyboard(pressed(`${modifier()}+Z`))
  await vi.waitFor(() => expect(field().value).toBe('Untitled'))
})

test('typing within the pause stays one step', async () => {
  await mount()
  await typeInField('ab')
  time += WITHIN_MS - 1
  await typeInField('c')
  await vi.waitFor(() => expect(field().value).toBe('Untitledabc'))
  await userEvent.keyboard(pressed(`${modifier()}+Z`))
  await vi.waitFor(() => expect(field().value).toBe('Untitled'))
})
