/**
 * The site as the build renders it: what `staticSite` evaluates through its
 * server. It is the description `vite build` reads, so `vite.config.ts` names
 * this module, never application code. The build prepares one dependency —
 * the site's posts — before rendering, and the plan carries it to the browser.
 */
import { Style } from 'foldkit-mixins'
import type { SiteModule } from 'foldkit-ssr/vite'
import { type Url } from 'foldkit/url'

import { Model, ORIGIN, init, plan, prerenderPaths, routing, update, view } from './main.js'
import { loadPosts } from './posts.js'
import { stylesheet } from './style.js'

/** Resolved once, so every path's config awaits the same read. */
const posts = loadPosts()

export const site = {
  origin: ORIGIN,
  paths: prerenderPaths,
  // The build's Model carries the posts the browser cannot fetch; the plan's
  // state (`App.model.posts`) is what carries them across.
  config: async () => {
    const loaded = await posts
    return {
      Model,
      init: (url: Url) => ({ model: { ...init(url).model, posts: loaded } }),
      update,
      view,
      container: null,
      routing,
    }
  },
  plan,
  // The foundations and the classes the page draws, so the first paint is
  // styled before any script runs. The browser's Styles find these classes
  // present and add none of them again.
  head: rendered => `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`,
  files: 'directory',
  sitemap: true,
  robots: true,
} satisfies SiteModule
