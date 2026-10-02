// @vitest-environment jsdom
/**
 * The application in the real runtime, in jsdom: every step draws each element
 * with a class, so the stylesheet reaches all of it, the email check runs its
 * real Command and its real 600ms, and a new position gets its id from the real
 * crypto.
 */
import { afterAll, expect, test, vi } from 'vitest'

import { button, next, start, text, typeInto } from './runtime.helpers.js'

afterAll(() => {
  vi.unstubAllGlobals()
})

/**
 * Every element on the page that no Slot style reached, less the `div` the
 * DatePicker wraps its trigger in, which it offers no attributes for, and an
 * svg's `path`, drawn by its chevron.
 */
const unclassed = (): ReadonlyArray<string> =>
  Array.from(document.body.querySelectorAll('*'))
    .filter(element => element.classList.length === 0 && !element.matches('path'))
    .filter(element => element.querySelector(':scope > [id$="-popover-button"]') === null)
    .map(element => element.outerHTML.slice(0, 120))

test('checks an email, adds a position, and styles every element of every step', async () => {
  await start()
  expect(document.title).toBe('Job Application')
  expect(unclassed()).toEqual([])

  typeInto('#email', 'test@example.com')
  await vi.waitFor(() => expect(text()).toContain('◐'))
  await vi.waitFor(() => expect(text()).toContain('This email is already in use'))
  expect(text()).not.toContain('◐')

  await next('Work History')
  expect(unclassed()).toEqual([])
  button('+ Add Position').click()
  await vi.waitFor(() => expect(document.querySelectorAll('input[id$="-company"]')).toHaveLength(2))

  await next('Education')
  expect(unclassed()).toEqual([])
  await next('Skills')
  expect(unclassed()).toEqual([])
  await next('Cover Letter')
  expect(unclassed()).toEqual([])
  await next('Attachments')
  expect(unclassed()).toEqual([])
  await next('Review')
  button('Submit Application').click()
  await vi.waitFor(() => expect(text()).toContain('before submitting.'))
  expect(unclassed()).toEqual([])

  // The stylesheet the page starts with carries no slot style, so each class
  // drawn arrived through the injection `style.ts` relies on.
  const css = Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent)
    .join('')
  const drawn = Array.from(document.querySelectorAll('[class]')).flatMap(element =>
    Array.from(element.classList),
  )
  expect(
    drawn.filter(className => className !== 'sr-only' && !css.includes(`.${className}`)),
  ).toEqual([])
})

// An open `@foldkit/ui` popup (the Listbox, the DatePicker, the Menu) takes
// about 35 seconds to draw in jsdom, here and upstream alike, so what the popups
// draw is checked by Scene (`test/step/personalInfo/scene.test.ts`) and in a
// browser, not here.
