import type { Post } from './main.js'

/**
 * The site's writing. A stand-in for a data source: the build awaits it before
 * rendering, and the plan carries what it returns to the browser, so this is
 * the one thing the page does not have to fetch to draw.
 */
export const loadPosts = async (): Promise<ReadonlyArray<Post>> => [
  { slug: 'model-is-the-cache', title: 'The Model Is the Cache' },
  { slug: 'stale-while-revalidate', title: 'Stale While Revalidate' },
  { slug: 'static-generation', title: 'Static Generation' },
]
