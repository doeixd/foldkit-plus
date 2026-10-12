/**
 * The site as the build renders it: what `staticSite` evaluates through its
 * server, named by `vite.config.ts`. Each page's config closes over its
 * address, which `init` names the page from.
 */
import { Style } from 'foldkit-mixins'
import type { SiteModule } from 'foldkit-ssr/vite'

import { library } from './content/load.js'
import { Model, ORIGIN, modelAt, plan, update, viewWith } from './main.js'
import { stylesheet } from './style.js'

export const site = {
  origin: ORIGIN,
  // The host serves `404.html` for an address with no page.
  paths: async () => [...(await library()).paths, '/404.html'],
  config: async (path: string) => {
    const content = await library()
    return {
      Model,
      init: () => ({ model: modelAt(content, path) }),
      update,
      view: viewWith(content),
      container: null,
    }
  },
  plan,
  // The foundations and the classes the page draws, so the first paint is
  // styled before any script runs.
  head: rendered => `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`,
  files: 'directory',
  sitemap: true,
  robots: true,
} satisfies SiteModule
