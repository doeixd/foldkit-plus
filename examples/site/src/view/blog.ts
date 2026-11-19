/**
 * A blog page: the index or a post, drawn by the build into a static region
 * with the blog's own styles (`blog/`), so the browser takes it over as it is.
 */
import type { Html } from 'foldkit/html'
import { SSR } from 'foldkit-ssr/client'

import type { Library } from '../library.js'
import type { Model } from '../shell.js'
import type { H, Slots } from './shellLayout.js'

export const blogPage = (model: Model, library: Library, h: H): ReadonlyArray<Html> => [
  h.div([], [SSR.static('blog', library.blog(model.path))]),
]

/** The posts in the rail, and in the phone menu, which is its own region: a region is drawn once. */
export const blogPosts = (
  model: Model,
  library: Library,
  region: 'rail' | 'menu',
  slots: Slots,
  h: H,
): ReadonlyArray<Html> => [
  h.nav(slots.sidebar.attrs([h.AriaLabel('Posts')]), [
    SSR.static(region === 'rail' ? 'posts' : 'menu-posts', library.blogPosts(model.path)),
  ]),
]
