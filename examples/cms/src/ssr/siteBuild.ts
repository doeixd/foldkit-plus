/**
 * The site as the build renders it: what `staticSite` evaluates through its
 * server. One prepared site — one seed, one clock — behind both hooks, so
 * the production build shares the tests' composition instead of duplicating
 * it. `prerender.ts` owns the composer; this module only names the build's
 * half of it.
 */
import type { SiteModule } from 'foldkit-ssr/vite'
import { ORIGIN } from '../content/domain.js'
import { prepareSite, siteTemplate, stylesOf } from './prerender.js'
import { plan } from './sitePlan.js'

/** The prepared site the build lists and renders from, started once. */
const prepared = (() => {
  let started: ReturnType<typeof prepareSite> | undefined
  return () => (started ??= prepareSite())
})()

export const site = {
  origin: ORIGIN,
  paths: async () => (await prepared()).paths(),
  config: async (path: string) => (await prepared()).configFor(path),
  plan,
  template: (built: string) => siteTemplate(built),
  head: rendered => stylesOf(rendered.html),
  files: 'flat',
  sitemap: true,
  robots: true,
} satisfies SiteModule
