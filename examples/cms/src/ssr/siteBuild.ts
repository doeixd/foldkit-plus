/**
 * The site as the build renders it: what `staticSite` evaluates through its
 * server. One prepared site — one seed, one clock — behind both hooks, so
 * the production build shares the tests' composition instead of duplicating
 * it. `prerender.ts` owns the composer; this module only names the build's
 * half of it.
 */
import type { SiteModule } from 'foldkit-ssr/vite'
import { ORIGIN } from '../content/domain.js'
import { prepareSite, renderNotFound, siteTemplate, stylesOf } from './prerender.js'
import { plan } from './sitePlan.js'

/** The prepared site the build lists and renders from, started once. */
const prepared = (() => {
  let started: ReturnType<typeof prepareSite> | undefined
  return () => (started ??= prepareSite())
})()

/** The shell the pages are rendered into, kept for the 404 page `emit` draws from it. */
let shell = ''

export const site = {
  origin: ORIGIN,
  paths: async () => (await prepared()).paths(),
  config: async (path: string) => (await prepared()).configFor(path),
  plan,
  template: (built: string) => (shell = siteTemplate(built)),
  head: rendered => stylesOf(rendered.html),
  files: 'flat',
  sitemap: true,
  robots: true,
  // A host with no 404.html answers every unknown address with the studio's shell and a 200.
  emit: async () => [{ file: '404.html', contents: await renderNotFound(await prepared(), shell) }],
} satisfies SiteModule
