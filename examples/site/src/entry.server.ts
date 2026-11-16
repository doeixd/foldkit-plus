/**
 * The dev server's entry for Foldkit's pipeline: `renderPage` serves every
 * page in development through the `foldkit` Vite plugin, each from a config
 * that closes over its address, as the build's do. `entry.ts` takes each page
 * over in the browser.
 */
import { Match } from 'effect'
import { Style } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr'

import { library } from './content/load.js'
import { publishStyle } from './devRelay.js'
import * as Gallery from './main.js'
import { isComponentPath } from './paths.js'
import * as Shell from './shell.js'

export const renderPage = async (request: Request) => {
  const content = await library()
  const path = new URL(request.url).pathname
  // The deployment this build belongs to, compiled in by the `foldkit` Vite
  // plugin from `FOLDKIT_BUILD_ID`. The browser compares it against the id
  // the page carries before adopting anything.
  const options = { buildId: import.meta.env.FOLDKIT_BUILD_ID }
  const result = await (isComponentPath(path)
    ? SSR.entry(
        {
          Model: Gallery.Model,
          init: () => ({ model: Gallery.modelAt(content, path) }),
          update: Gallery.update,
          view: Gallery.viewWith(content),
          container: null,
        },
        Gallery.servingPlan,
        options,
      ).renderPage(request)
    : SSR.entry(
        {
          Model: Shell.Model,
          init: () => ({ model: Shell.modelAt(content, path) }),
          update: Shell.update,
          view: Shell.viewWith(content),
          container: null,
        },
        Shell.servingPlan,
        options,
      ).renderPage(request))
  // The build writes the classes a page drew into its head (`site.ts`). A static
  // region (the code blocks of the guides and the components) is drawn on the
  // server only, so the browser never registers its classes: the dev server
  // hands them to the head the Vite plugin writes (`devRelay.ts`).
  Match.valueTags(result, {
    Rendered: ({ application }) => publishStyle(path, Style.usedIn(application.html)),
    Responded: () => undefined,
  })
  return result
}
