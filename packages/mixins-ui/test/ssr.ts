import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { Html, HtmlBuilder } from 'foldkit/html'

const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

/**
 * Draws `view` over `model` the way a server does and parses the page back as a
 * browser would. Foldkit's renderer refuses a view whose parse differs from what
 * was drawn, so a rejection here means the markup does not survive a parser.
 */
export const parsed = async <Model, Message>(
  model: Model,
  view: (model: Model, h: HtmlBuilder<Message>) => Html,
): Promise<Document> => {
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model }),
        view: (m: Model, h: HtmlBuilder<Message>) => ({ title: 'Served', body: view(m, h) }),
      },
      { buildId: 'b' },
    ),
  )
  return new DOMParser().parseFromString(injectIntoTemplate(template, served), 'text/html')
}
