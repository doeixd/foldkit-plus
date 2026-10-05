/**
 * The site as the build renders it: what `staticSite` evaluates through its
 * server, named by `vite.config.ts`.
 */
import { Style } from 'foldkit-mixins'
import type { SiteModule } from 'foldkit-ssr/vite'

import { Model, ORIGIN, init, plan, prerenderPaths, routing, update, view } from './main.js'
import { stylesheet } from './style.js'

export const site = {
  origin: ORIGIN,
  paths: prerenderPaths,
  config: async () => ({ Model, init, update, view, container: null, routing }),
  plan,
  // The foundations and the classes the page draws, so the first paint is
  // styled before any script runs.
  head: rendered => `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`,
  files: 'directory',
  sitemap: true,
  robots: true,
} satisfies SiteModule
