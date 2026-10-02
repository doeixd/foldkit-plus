// @vitest-environment jsdom
/**
 * The counter in the real runtime, with the stylesheet installed as `entry.ts`
 * installs it. The sheet carries no slot style, so each class a button draws
 * must arrive through the injection `style.ts` relies on.
 */
import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'

import { Model, init, update, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.replaceChildren()
  document.body.replaceChildren()
})

const buttonNamed = (name: string): HTMLButtonElement => {
  const found = Array.from(document.querySelectorAll('button')).find(
    button => button.textContent === name,
  )
  if (found === undefined) throw new Error(`no button named ${name}`)
  return found
}

test('counts on click, titles the page, and injects the CSS of every class it draws', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  Style.install(stylesheet)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)

  Runtime.run(Runtime.makeApplication({ Model, init, update, view, container }))

  await vi.waitFor(() => buttonNamed('+'))
  buttonNamed('+').click()
  buttonNamed('+').click()
  buttonNamed('-').click()
  await vi.waitFor(() => expect(document.title).toBe('Counter: 1'))
  expect(document.querySelector('p')?.textContent).toBe('1')

  const css = Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent)
    .join('')
  const drawn = Array.from(document.querySelectorAll('[class]')).flatMap(element =>
    Array.from(element.classList),
  )
  expect(drawn.length).toBeGreaterThan(0)
  expect(drawn.filter(className => !css.includes(`.${className}`))).toEqual([])
})
