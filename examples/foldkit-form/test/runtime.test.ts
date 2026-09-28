// @vitest-environment jsdom
/**
 * The form in the real runtime, with the stylesheet installed as `entry.ts`
 * installs it: the check runs its real Command and its real 500ms, and the
 * sheet carries no slot style, so each class drawn must arrive through the
 * injection `style.ts` relies on.
 */
import { Runtime } from 'foldkit'
import { afterEach, expect, test, vi } from 'vitest'

import { Model, init, update, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.replaceChildren()
  document.body.replaceChildren()
})

const typeInto = (id: string, value: string): void => {
  const input = document.getElementById(id)
  if (!(input instanceof HTMLInputElement)) throw new Error(`no input with id ${id}`)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** `@foldkit/ui`'s Button disables by `aria-disabled`. */
const isSubmitDisabled = (): boolean =>
  document.querySelector('button[type="submit"]')?.getAttribute('aria-disabled') === 'true'

const text = (): string => document.body.textContent ?? ''

test('checks the email for real, enables the submit, and injects the CSS of every class it draws', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const styles = document.createElement('style')
  styles.textContent = stylesheet
  document.head.append(styles)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)

  Runtime.run(Runtime.makeApplication({ Model, init, update, view, container }))

  await vi.waitFor(() => expect(document.getElementById('email')).not.toBeNull())
  expect(isSubmitDisabled()).toBe(true)

  typeInto('email', 'test@example.com')
  await vi.waitFor(() => expect(text()).toContain('Checking...'))
  expect(isSubmitDisabled()).toBe(true)
  await vi.waitFor(() => expect(text()).toContain('This email is already on our waitlist'))

  typeInto('email', 'alice@example.com')
  await vi.waitFor(() => expect(text()).toContain('✓'))
  expect(text()).not.toContain('Checking...')
  expect(isSubmitDisabled()).toBe(false)
  expect(document.title).toBe('Foldkit Form Example')

  typeInto('email', 'alice@example.org')
  await vi.waitFor(() => expect(text()).toContain('◐'))
  const css = Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent)
    .join('')
  const drawn = Array.from(document.querySelectorAll('[class]')).flatMap(element =>
    Array.from(element.classList),
  )
  expect(drawn.length).toBeGreaterThan(0)
  expect(drawn.filter(className => !css.includes(`.${className}`))).toEqual([])
  // The spinner turns by a keyframes rule no class carries.
  expect(css).toMatch(/@keyframes [\w-]+\{to\{transform:rotate\(360deg\)\}\}/)
})
