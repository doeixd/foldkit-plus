/**
 * What a browser does with a served page, for tests that each own a jsdom: a
 * hydrated program cannot be stopped, and a page holds one application.
 */
import { Effect } from 'effect'
import {
  injectIntoTemplate,
  type RenderedApplication,
  type RenderError,
} from 'foldkit/experimental/server'

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

/** Renders, places the result in the template, and loads it as the document. */
export const serve = async (render: Effect.Effect<RenderedApplication, RenderError>) => {
  const page = injectIntoTemplate(template, await Effect.runPromise(render))
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
  return page
}

/** The root the server stamped, which a page-owning application must adopt. */
export const root = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-foldkit-app]')

/** Lets the runtime boot or settle a Message. */
export const settle = () => new Promise(resolve => setTimeout(resolve, 20))
