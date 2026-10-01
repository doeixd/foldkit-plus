/**
 * The site as the build renders it: what `staticSite` evaluates through its
 * server. It is the description `vite build` reads, so `vite.config.ts` names
 * this module, never application code.
 */
import { Style } from 'foldkit-mixins'
import type { SiteModule } from 'foldkit-ssr/vite'

import { Model, init, plan, prerenderPaths, routing, update, view } from './main.js'
import { stylesheet } from './style.js'

/**
 * Where the pages are parsed as if served from: a routing `init` reads a full
 * URL. Also the origin the sitemap and `robots.txt` name.
 */
const ORIGIN = 'https://example.com'

export const site = {
  origin: ORIGIN,
  paths: prerenderPaths,
  config: { Model, init, update, view, container: null, routing },
  plan,
  // The foundations and the classes the page draws, so the first paint is
  // styled before any script runs. The browser's Styles find these classes
  // present and add none of them again.
  head: rendered => `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`,
  files: 'directory',
  sitemap: true,
  robots: true,
} satisfies SiteModule
