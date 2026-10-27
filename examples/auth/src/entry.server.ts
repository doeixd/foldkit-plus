/**
 * The dev server's entry for Foldkit's pipeline: the `foldkit` Vite plugin
 * calls this `renderPage` for every page request. `vite.config.ts` compiles
 * in the build's id and the auth server's address; `page.ts` does the rest.
 * Vite renders in a process of its own, beside the auth server, so each page
 * reads over HTTP (`httpReader`); `host.ts` serves pages in the auth server's
 * own process instead.
 */
import { PageContext, httpReader, makeRenderPage } from './page.js'

const authServer: unknown = import.meta.env.AUTH_SERVER
if (typeof authServer !== 'string')
  throw new Error(
    'examples/auth: start the dev server through vite.config.ts, which names AUTH_SERVER',
  )

const page = makeRenderPage({ buildId: import.meta.env.FOLDKIT_BUILD_ID })

export const renderPage = (request: Request) =>
  page(PageContext.attach(request, { reader: httpReader(request, authServer) }))
