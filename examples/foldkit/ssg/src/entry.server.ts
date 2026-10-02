/**
 * The build's server entry for Foldkit's pipeline: `renderPage` serves every
 * page in development through the `foldkit` Vite plugin, and `prerenderPaths`
 * names the static routes `src/site.ts` generates with `staticSite`.
 * `entry.ts` takes each page over in the browser.
 */
import { SSR } from 'foldkit-ssr'

import { Model, init, plan, prerenderPaths, routing, update, view } from './main.js'

export { prerenderPaths }

export const renderPage = SSR.entry({ Model, init, update, view, container: null, routing }, plan, {
  // The deployment this build belongs to, compiled in by the `foldkit` Vite
  // plugin from `FOLDKIT_BUILD_ID`. The browser compares it against the id
  // the page carries before adopting anything.
  buildId: import.meta.env.FOLDKIT_BUILD_ID,
}).renderPage
