/**
 * The site as the build renders it: what `staticSite` evaluates through its
 * server, named by `vite.config.ts`. Each page's config closes over its
 * address, which `init` names the page from. The component pages and the theme
 * creator are an application of their own, with a plan of their own.
 */
import { Style } from 'foldkit-mixins'
import type { SiteModule } from 'foldkit-ssr/vite'

import type { ServerLibrary } from './content/library.js'
import { library as repositoryLibrary } from './content/load.js'
import { headScripts } from './head.js'
import * as Gallery from './main.js'
import { isComponentPath } from './paths.js'
import * as Shell from './shell.js'
import { stylesheet } from './style.js'

// Annotated rather than `satisfies`: the inferred type, the whole Model's, is too long to write out.
// A function of its library, so a test can render the site from a smaller one.
export const siteOf = (library: () => Promise<ServerLibrary>): SiteModule => ({
  origin: Shell.ORIGIN,
  // The host serves `404.html` for an address with no page.
  paths: async () => {
    const { paths, modified } = await library()
    return [
      ...paths.map(path => {
        const at = modified.get(path)
        return at === undefined ? path : { path, modified: at }
      }),
      '/404.html',
    ]
  },
  // The blog's Atom feed, which the pages' head links (`index.html`).
  emit: async () => [{ file: 'blog/feed.xml', contents: (await library()).feed(Shell.ORIGIN) }],
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
})

export const site = siteOf(repositoryLibrary)
