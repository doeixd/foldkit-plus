/** The bindings application, planned to boot on the first interaction. */
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { SSR, type Start } from 'foldkit-ssr'
import { App, plan } from './bindingsFixture.js'

export { config, load, template } from './bindingsFixture.js'

export const planned = (start: Start) =>
  SSR.plan(App, { id: 'post', state: plan.state, surfaces: plan.surfaces, start })

/** The element the server rendered with this id. */
export const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`the page has no #${id}`)
  return element
}

/** Whether Foldkit has adopted the page: it removes the stamp just before its first patch. */
export const booted = (): boolean => document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`) === null

export const settle = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
