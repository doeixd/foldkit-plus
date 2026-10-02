/**
 * The server's half of the example for Foldkit's pipeline: the `renderPage`
 * the dev server and the production host call. `renderPage.ts` builds it;
 * `entry.ts` takes the page over in the browser.
 */
import { makeRenderPage } from './renderPage.js'

export const renderPage = makeRenderPage(
  // The deployment this build belongs to, compiled in by the `foldkit` Vite
  // plugin from `FOLDKIT_BUILD_ID`. The browser compares it against the id
  // the page carries before adopting anything.
  import.meta.env.FOLDKIT_BUILD_ID,
)
