/**
 * The dev server's entry for Foldkit's pipeline: the `foldkit` Vite plugin
 * calls this `renderPage` for every page request. `vite.config.ts` compiles
 * in the build's id and the auth server's address; `page.ts` does the rest.
 */
import { makeRenderPage } from './page.js'

const authServer: unknown = import.meta.env.AUTH_SERVER
if (typeof authServer !== 'string')
  throw new Error(
    'examples/auth: start the dev server through vite.config.ts, which names AUTH_SERVER',
  )

export const renderPage = makeRenderPage({
  buildId: import.meta.env.FOLDKIT_BUILD_ID,
  authServer,
})
