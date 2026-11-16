/**
 * The site as the build renders it: what `staticSite` evaluates through its
 * server, named by `vite.config.ts`. Each page's config closes over its
 * address, which `init` names the page from. The component pages and the theme
 * creator are an application of their own, with a plan of their own.
 */
import { Style } from 'foldkit-mixins'
import type { SiteModule } from 'foldkit-ssr/vite'

import { library } from './content/load.js'
import { headScripts } from './head.js'
import * as Gallery from './main.js'
import { isComponentPath } from './paths.js'
import * as Shell from './shell.js'
import { stylesheet } from './style.js'

// Annotated rather than `satisfies`: the inferred type, the whole Model's, is too long to write out.
export const site: SiteModule = {
  origin: Shell.ORIGIN,
  // The host serves `404.html` for an address with no page.
  paths: async () => [...(await library()).paths, '/404.html'],
  config: async (path: string) => {
    const content = await library()
    return isComponentPath(path)
      ? {
          Model: Gallery.Model,
          init: () => ({ model: Gallery.modelAt(content, path) }),
          update: Gallery.update,
          view: Gallery.viewWith(content),
          container: null,
        }
      : {
          Model: Shell.Model,
          init: () => ({ model: Shell.modelAt(content, path) }),
          update: Shell.update,
          view: Shell.viewWith(content),
          container: null,
        }
  },
  plan: path => (isComponentPath(path) ? Gallery.plan : Shell.plan),
  // The reader's light or dark and theme, applied before anything draws; then
  // the foundations and the classes the page draws, so the first paint is
  // styled before any other script runs.
  head: (_rendered, drawn) =>
    `${headScripts}<style>${stylesheet}</style><style>${Style.usedDrawn(drawn)}</style>`,
  // `/remote` as `remote.html`: the host serves it at that address, with no
  // redirect to `/remote/` on every link.
  files: 'flat',
  sitemap: true,
  robots: true,
}
