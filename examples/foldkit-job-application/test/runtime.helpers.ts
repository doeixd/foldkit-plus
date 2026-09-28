import { Runtime } from 'foldkit'
import { expect, vi } from 'vitest'

import { Flags, Model, flags, init, update, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'

/**
 * Runs the application as `entry.ts` does, with its real Flags, Commands and
 * stylesheet. A runtime is not disposed, so each test file starts one.
 */
export const start = async (): Promise<void> => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const styles = document.createElement('style')
  styles.textContent = stylesheet
  document.head.append(styles)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  Runtime.run(Runtime.makeApplication({ Model, Flags, init, update, view, container }), { flags })
  await vi.waitFor(() => expect(text()).toContain('Apply to Work on Foldkit'))
}

export const text = (): string => document.body.textContent ?? ''

export const typeInto = (selector: string, value: string): void => {
  const input = document.querySelector(selector)
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
    throw new Error(`no input at ${selector}`)
  }
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export const button = (name: string): HTMLElement => {
  const found = Array.from(document.querySelectorAll<HTMLElement>('button, [role="tab"]')).find(
    element => element.textContent?.trim() === name,
  )
  if (found === undefined) throw new Error(`no button named ${name}`)
  return found
}

/** Moves to the next step and waits for its heading. */
export const next = async (heading: string): Promise<void> => {
  button('Next →').click()
  await vi.waitFor(() => expect(document.querySelector('h2')?.textContent).toBe(heading))
}
