/**
 * The dev server's entry for Foldkit's pipeline: `renderPage` serves every
 * page in development through the `foldkit` Vite plugin, each from a config
 * that closes over its address, as the build's do. `entry.ts` takes each page
 * over in the browser.
 */
import { SSR } from 'foldkit-ssr'

import { library } from './content/load.js'
import { Model, modelAt, servingPlan, update, viewWith } from './main.js'

export const renderPage = async (request: Request) => {
  const content = await library()
  const path = new URL(request.url).pathname
  return SSR.entry(
    {
      Model,
      init: () => ({ model: modelAt(content, path) }),
      update,
      view: viewWith(content),
      container: null,
    },
    servingPlan,
    // The deployment this build belongs to, compiled in by the `foldkit` Vite
    // plugin from `FOLDKIT_BUILD_ID`. The browser compares it against the id
    // the page carries before adopting anything.
    { buildId: import.meta.env.FOLDKIT_BUILD_ID },
  ).renderPage(request)
}
