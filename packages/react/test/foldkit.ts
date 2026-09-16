/** Shared harness: a real Foldkit element runtime in jsdom. */
import type { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

export const text = (selector: string) => document.querySelector(selector)?.textContent
export const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click()
export const settle = () => new Promise(resolve => setTimeout(resolve, 20))

export const mount = <Model, Message extends { readonly _tag: string }>(config: {
  readonly Model: Schema.Codec<Model, any>
  readonly init: Model
  readonly update: (model: Model, message: Message) => Model
  readonly view: (model: Model, h: HtmlBuilder<Message>) => Html
  readonly devTools?: Runtime.DevToolsConfig
}) => {
  const container = document.createElement('div')
  // The runtime renders into its container by id.
  container.id = 'app'
  document.body.appendChild(container)
  const program = Runtime.makeElement({
    Model: config.Model,
    container,
    init: () => ({ model: config.init }),
    update: (model: Model, message: Message) => ({ model: config.update(model, message) }),
    view: config.view,
    ...(config.devTools === undefined ? {} : { devTools: config.devTools }),
  })
  return Runtime.embed(program)
}
