import { Runtime } from 'foldkit'
import { expect, vi } from 'vitest'

import { Flags, Message, Model, flags, init, update, view } from '../src/main.js'

/**
 * Starts the application as `entry.ts` does, at `path`. The runtime has no
 * dispose and listens to the window's history, so each test file starts one.
 */
export const start = (path: string): void => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  window.history.replaceState(null, '', path)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)

  Runtime.run(
    Runtime.makeApplication({
      Model,
      Flags,
      init,
      update,
      view,
      container,
      routing: {
        onUrlRequest: request => Message.ClickedLink({ request }),
        onUrlChange: url => Message.ChangedUrl({ url }),
      },
    }),
    { flags },
  )
}

export const text = (): string => document.body.textContent ?? ''

export const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 3_000 })

export const byText = <E extends Element>(selector: string, name: string): E => {
  const found = Array.from(document.querySelectorAll<E>(selector)).find(
    element => element.textContent === name,
  )
  if (found === undefined) throw new Error(`no ${selector} named ${name}`)
  return found
}

export const typeInto = (id: string, value: string): void => {
  const input = document.getElementById(id)
  if (!(input instanceof HTMLInputElement)) throw new Error(`no input #${id}`)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export const expectAt = async (pathname: string, title: string): Promise<void> => {
  await waitFor(() => {
    expect(document.title).toBe(title)
    expect(window.location.pathname).toBe(pathname)
  })
}
